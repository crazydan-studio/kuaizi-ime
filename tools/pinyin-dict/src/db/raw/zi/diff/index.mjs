/* 对比不同版本的 SQLite 字典库的数据差异 */
import { openDB, closeDB } from '#utils/sqlite.mjs';

import {
  getZiDictSQLiteVersionFile,
  getZiDictSQLiteFile
} from '#db/utils.mjs';

import { diffMetaData, diffZiData } from './diff.mjs';

const oldDictDataSQLiteFile = getZiDictSQLiteVersionFile('v3');
const dictDataSQLiteFile = getZiDictSQLiteFile();

const oldDb = openDB(oldDictDataSQLiteFile);
const newDb = openDB(dictDataSQLiteFile);

try {
  console.log();
  console.log('对比元数据的差异 ...');
  diffMetaData(oldDb, newDb);

  console.log();
  console.log('对比字数据的差异 ...');
  diffZiData(oldDb, newDb);
} finally {
  closeDB(oldDb);
  closeDB(newDb);
}
