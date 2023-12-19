/* 词组预测的 SQLite 词库 */
import { fromRootPath } from '../../../utils/utils.mjs';
import * as prediction from './prediction.mjs';
import inquirer from 'inquirer';

// 包含完整拼音和字信息的 SQLite 数据库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// 词组预测的 SQLite 数据库
const predDictSQLiteFile = fromRootPath('data', 'pinyin-pred-dict.sqlite');

console.log();
let wordDictDB = await prediction.open(wordDictSQLiteFile, true);
let predDictDB = await prediction.open(predDictSQLiteFile, true);

try {
  while (await start(predDictDB, wordDictDB)) {}
} catch (e) {
  throw e;
} finally {
  await prediction.close(wordDictDB);
  await prediction.close(predDictDB);
}

console.log();

async function start(predDictDB, wordDictDB) {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'pinyin',
      message: '请输入拼音，拼音之间以空格分隔:'
    }
  ]);

  const pinyin = answer.pinyin.trim();
  if (!pinyin) {
    return false;
  }

  const chars = pinyin.split(/\s+/g);
  const words = await prediction.predict(predDictDB, wordDictDB, chars);

  words.forEach((w, i) => {
    console.log(i + 1, w[0], w[1].join(''));
  });

  return true;
}
