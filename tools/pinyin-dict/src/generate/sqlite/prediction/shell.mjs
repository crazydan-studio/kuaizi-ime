/* 词组预测的 SQLite 词库 */
import { fromRootPath, readJSONFromFile } from '../../../utils/utils.mjs';
import * as prediction from './prediction.mjs';

// 包含完整拼音和字信息的 SQLite 数据库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// 词组预测的 SQLite 数据库
const predDictSQLiteFile = fromRootPath('data', 'pinyin-pred-dict.sqlite');

console.log();
let wordDictDB = await prediction.open(wordDictSQLiteFile, true);
let predDictDB = await prediction.open(predDictSQLiteFile, true);

try {
  const words = await prediction.predict(predDictDB, wordDictDB, [
    'wo',
    'shi',
    'zhong',
    'guo',
    'ren'
  ]);
  console.log(words);
} catch (e) {
  throw e;
} finally {
  await prediction.close(wordDictDB);
  await prediction.close(predDictDB);
}

console.log();
