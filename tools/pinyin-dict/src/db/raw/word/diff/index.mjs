/* 对比不同版本的 SQLite 字典库的数据差异 */
import { openDB, closeDB } from '#utils/sqlite.mjs';

import {
  getWordDictSQLiteVersionFile,
  getWordDictSQLiteFile
} from '#db/utils.mjs';

import { diffMetaData, diffWordData } from './diff.mjs';

const oldDictDataSQLiteFile = getWordDictSQLiteVersionFile('v3');
const dictDataSQLiteFile = getWordDictSQLiteFile();

const oldDb = openDB(oldDictDataSQLiteFile);
const newDb = openDB(dictDataSQLiteFile);

try {
  console.log();
  console.log('对比元数据的差异 ...');
  diffMetaData(oldDb, newDb);

  console.log();
  console.log('对比字数据的差异 ...');
  diffWordData(oldDb, newDb);
} catch (e) {
  throw e;
} finally {
  closeDB(oldDb);
  closeDB(newDb);
}
