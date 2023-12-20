/* SQLite 词典库 */
import { fromRootPath } from '../../../utils/utils.mjs';
import * as phrase from './phrase.mjs';
import inquirer from 'inquirer';

// SQLite 字库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');

console.log();
let wordDictDB = await phrase.open(wordDictSQLiteFile, true);
let phraseDictDB = await phrase.open(phraseDictSQLiteFile, true);

try {
  while (await start(phraseDictDB, wordDictDB)) {}
} catch (e) {
  throw e;
} finally {
  await phrase.close(wordDictDB);
  await phrase.close(phraseDictDB);
}

console.log();

async function start(phraseDictDB, wordDictDB) {
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
  const words = await phrase.predict(phraseDictDB, wordDictDB, chars);

  words.forEach((w, i) => {
    console.log(i + 1, w[0], w[1].join(''));
  });

  return true;
}
