// https://www.sqlitetutorial.net/sqlite-nodejs/connect/
// https://github.com/TryGhost/node-sqlite3/wiki/API
import sqlite3 from 'sqlite3';
// https://www.npmjs.com/package/sqlite
import * as sqlite from 'sqlite';

import { splitChars, extractPinyinChars } from './utils.mjs';

export async function openDB(file, readonly) {
  const db = await sqlite.open({
    filename: file,
    mode: readonly
      ? sqlite3.OPEN_READONLY
      : sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE,
    driver: sqlite3.Database
  });

  // 提升批量写入性能: https://avi.im/blag/2021/fast-sqlite-inserts/
  await execSQL(
    db,
    `
PRAGMA journal_mode = OFF;
PRAGMA synchronous = 0;
PRAGMA cache_size = 1000000;
PRAGMA locking_mode = EXCLUSIVE;
PRAGMA temp_store = MEMORY;
  `
  );

  return db;
}

export async function closeDB(db, skipClean) {
  if (db.config.mode != sqlite3.OPEN_READONLY && !skipClean) {
    // 数据库无用空间回收
    await execSQL(db, 'VACUUM');
  }

  await db.close();
}

/** 新增或更新数据 */
export async function saveToDB(db, table, dataMap, disableSorting) {
  const dataArray = mapToArray(dataMap, disableSorting);
  if (dataArray.length === 0) {
    return;
  }

  const columnsWithId = Object.keys(dataArray[0]).filter(
    (k) => !k.startsWith('__')
  );
  const columns = columnsWithId.filter((k) => k != 'id_');

  const insertStatement = await db.prepare(
    `insert into ${table} (${columns.join(', ')}) values (${columns
      .map(() => '?')
      .join(', ')})`
  );
  const insertWithIdStatement = await db.prepare(
    `insert into ${table} (${columnsWithId.join(', ')}) values (${columnsWithId
      .map(() => '?')
      .join(', ')})`
  );
  const updateStatement = await db.prepare(
    `update ${table} set ${columns
      .map((c) => c + ' = ?')
      .join(', ')} where id_ = ?`
  );

  await asyncForEach(dataArray, async (data) => {
    if (data.id_) {
      const needToUpdate =
        data.__exist__ &&
        columns.reduce((r, c) => r || data[c] !== data.__exist__[c], false);

      if (needToUpdate) {
        await updateStatement.run(...columns.concat('id_').map((c) => data[c]));
      }
      // 新增包含 id 的数据
      else if (!data.__exist__) {
        await insertWithIdStatement.run(...columnsWithId.map((c) => data[c]));
      }
    } else {
      await insertStatement.run(...columns.map((c) => data[c]));
    }
  });

  await insertStatement.finalize();
  await insertWithIdStatement.finalize();
  await updateStatement.finalize();
}

/** 删除数据 */
export async function removeFromDB(db, table, ids) {
  if (ids.length === 0) {
    return;
  }

  const deleteStatement = await db.prepare(
    `delete from ${table} where id_ = ?`
  );

  await asyncForEach(ids, async (id) => {
    await deleteStatement.run(id);
  });

  await deleteStatement.finalize();
}

export async function execSQL(db, sqls) {
  await asyncForEach(sqls.split(/;/g), async (sql) => {
    await db.exec(sql);
  });
}

export async function asyncForEach(array, cb) {
  for (const e of array) {
    await cb(e);
  }
}

function mapToArray(obj, disableSorting) {
  if (disableSorting === true) {
    return Object.keys(obj).map((k) => obj[k]);
  }

  const charSpecials = {
    a: ['ā', 'á', 'ǎ', 'à'],
    o: ['ō', 'ó', 'ǒ', 'ò'],
    e: ['ē', 'é', 'ě', 'è', 'ê', 'ê̄', 'ế', 'ê̌', 'ề'],
    i: ['ī', 'í', 'ǐ', 'ì'],
    u: ['ū', 'ú', 'ǔ', 'ù'],
    ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
    n: ['ń', 'ň', 'ǹ'],
    m: ['m̄', 'ḿ', 'm̀']
  };
  const charWeights = { ˉ: 10001, ˊ: 10002, ˇ: 10003, ˋ: 10004 };
  for (let i = 97, j = 1; i <= 122; i++, j++) {
    const ch = String.fromCharCode(i);
    const weight = j * 15;
    charWeights[ch] = weight;

    const specials = charSpecials[ch];
    if (specials) {
      for (let k = 0; k < specials.length; k++) {
        const special = specials[k];

        charWeights[special] = weight + (k + 1);
      }
    }
  }
  const getCharCode = (ch) => {
    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      sum += ch.charCodeAt(i);
    }
    return sum;
  };

  // Note: 主要排序带音调的拼音（注音规则暂时不清楚，故不处理），其余的按字符顺序排序
  const keys = Object.keys(obj).sort((a, b) => {
    const a_without_special = extractPinyinChars(a).replaceAll(/[ˊˇˋˉ]$/g, '');
    const b_without_special = extractPinyinChars(b).replaceAll(/[ˊˇˋˉ]$/g, '');

    if (a_without_special === b_without_special) {
      const a_weight = splitChars(a)
        .map((ch) => charWeights[ch] || getCharCode(ch))
        .reduce((acc, w) => acc + w, 0);
      const b_weight = splitChars(b)
        .map((ch) => charWeights[ch] || getCharCode(ch))
        .reduce((acc, w) => acc + w, 0);

      return a_weight - b_weight;
    }

    return a_without_special > b_without_special
      ? 1
      : a_without_special < b_without_special
      ? -1
      : 0;
  });

  return keys.map((k) => obj[k]);
}
