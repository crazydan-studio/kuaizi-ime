// https://www.sqlitetutorial.net/sqlite-nodejs/connect/
// https://github.com/TryGhost/node-sqlite3/wiki/API
import sqlite3 from 'sqlite3';
// https://www.npmjs.com/package/sqlite
import * as sqlite from 'sqlite';

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

export async function closeDB(db) {
  if (db.config.mode != sqlite3.OPEN_READONLY) {
    // 数据库无用空间回收
    await execSQL(db, 'VACUUM');
  }

  await db.close();
}

/** 新增或更新数据 */
export async function saveToDB(db, table, dataMap) {
  const dataArray = mapToArray(dataMap);
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
        columns.reduce((r, c) => r || data[c] != data.__exist__[c], false);

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

function mapToArray(obj) {
  return Object.keys(obj).map((k) => obj[k]);
}
