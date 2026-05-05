// https://www.sqlitetutorial.net/sqlite-nodejs/connect/
import { DatabaseSync } from 'node:sqlite';

import { readFile, existFile } from './file.mjs';
import { splitChars, zeroPinyinTone } from './spell.mjs';

export function openDB(file, { readonly, ignoreCheckConstraints } = {}) {
  const options = { readOnly: readonly === true };
  const db = new DatabaseSync(file, options);
  db.opts = options;

  // 提升批量写入性能: https://avi.im/blag/2021/fast-sqlite-inserts/
  execSQL(
    db,
    `
pragma journal_mode = off;
pragma synchronous = 0;
pragma cache_size = 1000000;
pragma locking_mode = exclusive;
pragma temp_store = memory;
  `
  );

  if (ignoreCheckConstraints === true) {
    execSQL(
      db,
      `
pragma foreign_keys = 0;
pragma ignore_check_constraints = 1;
    `
    );
  }

  return db;
}

export function attachDB(db, sources) {
  // 附加数据库（连接期内有效）: https://www.sqlite.org/lang_attach.html
  execSQL(
    db,
    Object.keys(sources)
      .map((name) => `attach database '${sources[name]}' as ${name}`)
      .join(';')
  );

  return db;
}

export function closeDB(db, skipClean) {
  try {
    if (!db.opts.readOnly && !skipClean) {
      // 数据库无用空间回收
      execSQL(db, 'vacuum');
    }

    db.close();
  } catch (e) {
    console.error(e);
  }
}

/** 新增或更新数据 */
export function saveToDB(db, table, dataMap, disableSortingByKey, primaryKeys) {
  const dataArray = mapToArray(dataMap, disableSortingByKey);
  if (dataArray.length === 0) {
    return;
  }

  primaryKeys = primaryKeys || ['id_'];
  const hasOnlyIdKey = primaryKeys.length == 1 && primaryKeys[0] == 'id_';

  const columnsWithPK = Object.keys(dataArray[0]).filter(
    (k) => !k.startsWith('__')
  );
  const columnsWithoutPK = columnsWithPK.filter(
    (k) => !primaryKeys.includes(k)
  );

  const insertWithPKSql = `insert into ${table} (${columnsWithPK.join(
    ', '
  )}) values (${columnsWithPK.map(() => '?').join(', ')})
  `;
  const insertWithPKStatement = db.prepare(insertWithPKSql);
  const insertStatement =
    hasOnlyIdKey && columnsWithoutPK.length > 0
      ? db.prepare(
          `insert into ${table} (${columnsWithoutPK.join(', ')}) values (${columnsWithoutPK
            .map(() => '?')
            .join(', ')})
          `
        )
      : insertWithPKStatement;
  const updateStatement =
    columnsWithoutPK.length > 0
      ? db.prepare(
          `update ${table} set ${columnsWithoutPK
            .map((c) => c + ' = ?')
            .join(', ')} where ${primaryKeys
            .map((key) => key + ' = ?')
            .join(' and ')}
    `
        )
      : // 所有的列都为主键，则不需要更新
        null;

  const getId = (d) => primaryKeys.map((k) => d[k]).join('');
  //
  withTransaction(db, () => {
    //
    dataArray.forEach((data) => {
      //
      if (getId(data)) {
        const needToUpdate =
          data.__exist__ &&
          columnsWithoutPK.reduce(
            (r, c) => r || data[c] !== data.__exist__[c],
            false
          );

        if (needToUpdate) {
          updateStatement.run(
            ...columnsWithoutPK.concat(primaryKeys).map((c) => data[c])
          );
        }
        // 新增包含 id 的数据
        else if (!data.__exist__) {
          insertWithPKStatement.run(...columnsWithPK.map((c) => data[c]));
        }
      } else {
        const params = (hasOnlyIdKey ? columnsWithoutPK : columnsWithPK).map(
          (c) => data[c]
        );
        insertStatement.run(...params);
      }
    });
  });
}

/** 删除数据 */
export function removeFromDB(db, table, data, primaryKeys) {
  if (data.length === 0) {
    return;
  }

  primaryKeys = primaryKeys || ['id_'];

  const deleteStatement = db.prepare(
    `delete from ${table} where ${primaryKeys
      .map((key) => key + ' = ?')
      .join(' and ')}
    `
  );

  withTransaction(db, () => {
    data.forEach((d) => {
      const params = typeof d == 'object' ? primaryKeys.map((c) => d[c]) : [d];
      deleteStatement.run(...params);
    });
  });
}

export function hasTable(db, table) {
  const result = db
    .prepare(
      `select count(*) as total from sqlite_master where type='table' and name='${table}'`
    )
    .get();

  return result.total == 1;
}

export function execSQL(db, sqls) {
  sqls.split(/;/g).forEach((sql) => db.exec(sql));
}

export function execSQLFile(db, file) {
  if (!existFile(file)) {
    throw new Error(`The SQL file '${file}' doesn't exist.`);
  }

  const sqls = readFile(file);
  execSQL(db, sqls);
}

export function queryAll(db, sql, ...args) {
  return db.prepare(sql).all(...args);
}

export function withTransaction(db, cb) {
  db.exec('BEGIN TRANSACTION');

  try {
    cb();

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function mapToArray(obj, disableSortingByKey) {
  if (Array.isArray(obj)) {
    return obj;
  }

  if (disableSortingByKey === true) {
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
    const a_without_special = zeroPinyinTone(a).replaceAll(/[ˊˇˋˉ]$/g, '');
    const b_without_special = zeroPinyinTone(b).replaceAll(/[ˊˇˋˉ]$/g, '');

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
