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
pragma journal_mode = off;
pragma synchronous = 0;
pragma cache_size = 1000000;
pragma locking_mode = exclusive;
pragma temp_store = memory;
  `
  );

  return db;
}

export async function attachDB(db, sources) {
  // 附加数据库（连接期内有效）: https://www.sqlite.org/lang_attach.html
  await execSQL(
    db,
    Object.keys(sources)
      .map((name) => `attach database '${sources[name]}' as ${name}`)
      .join(';')
  );

  return db;
}

export async function closeDB(db, skipClean) {
  try {
    if (db.config.mode != sqlite3.OPEN_READONLY && !skipClean) {
      // 数据库无用空间回收
      await execSQL(db, 'vacuum');
    }

    await db.close();
  } catch (e) {
    console.error(e);
  }
}

/** 新增或更新数据 */
export async function saveToDB(
  db,
  table,
  dataMap,
  disableSorting,
  primaryKeys
) {
  const dataArray = mapToArray(dataMap, disableSorting);
  if (dataArray.length === 0) {
    return;
  }

  primaryKeys = primaryKeys || ['id_'];
  const hasOnlyIdKey = primaryKeys.length == 1 && primaryKeys[0] == 'id_';

  const columnsWithPrimaryKey = Object.keys(dataArray[0]).filter(
    (k) => !k.startsWith('__')
  );
  const columns = columnsWithPrimaryKey.filter((k) => !primaryKeys.includes(k));

  const insertWithIdSql = `insert into ${table} (${columnsWithPrimaryKey.join(
    ', '
  )}) values (${columnsWithPrimaryKey.map(() => '?').join(', ')})
  `;
  const insertWithIdStatement = await db.prepare(insertWithIdSql);
  const insertStatement = hasOnlyIdKey
    ? await db.prepare(
        `insert into ${table} (${columns.join(', ')}) values (${columns
          .map(() => '?')
          .join(', ')})
          `
      )
    : await db.prepare(insertWithIdSql);
  const updateStatement =
    columns.length > 0
      ? await db.prepare(
          `update ${table} set ${columns
            .map((c) => c + ' = ?')
            .join(', ')} where ${primaryKeys
            .map((key) => key + ' = ?')
            .join(' and ')}
    `
        )
      : // 所有的列都为主键，则不需要更新
        null;

  const getId = (d) => primaryKeys.map((k) => d[k]).join('');
  await asyncForEach(dataArray, async (data) => {
    if (getId(data)) {
      const needToUpdate =
        data.__exist__ &&
        columns.reduce((r, c) => r || data[c] !== data.__exist__[c], false);

      if (needToUpdate) {
        await updateStatement.run(
          ...columns.concat(primaryKeys).map((c) => data[c])
        );
      }
      // 新增包含 id 的数据
      else if (!data.__exist__) {
        await insertWithIdStatement.run(
          ...columnsWithPrimaryKey.map((c) => data[c])
        );
      }
    } else {
      const params = (hasOnlyIdKey ? columns : columnsWithPrimaryKey).map(
        (c) => data[c]
      );
      await insertStatement.run(...params);
    }
  });

  await insertStatement.finalize();
  await insertWithIdStatement.finalize();
  updateStatement && (await updateStatement.finalize());
}

/** 删除数据 */
export async function removeFromDB(db, table, ids, primaryKeys) {
  if (ids.length === 0) {
    return;
  }

  primaryKeys = primaryKeys || ['id_'];
  const hasOnlyIdKey = primaryKeys.length == 1 && primaryKeys[0] == 'id_';

  const deleteStatement = await db.prepare(
    `delete from ${table} where ${primaryKeys
      .map((key) => key + ' = ?')
      .join(' and ')}
    `
  );

  await asyncForEach(ids, async (id) => {
    const params = hasOnlyIdKey ? [id] : primaryKeys.map((c) => id[c]);
    await deleteStatement.run(...params);
  });

  await deleteStatement.finalize();
}

export async function hasTable(db, table) {
  const result = await db.get(
    `select count(*) as total from sqlite_master where type='table' and name='${table}'`
  );
  return result.total == 1;
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
