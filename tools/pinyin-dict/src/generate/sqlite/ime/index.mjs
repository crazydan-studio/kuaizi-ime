/* 供输入法使用的 SQLite 字典库 */
import {
  fromRootPath,
  fileSHA256,
  appendLineToFile
} from '../../../utils/utils.mjs';
import * as ime from './ime.mjs';

// SQLite 字典库
const wordDictDataSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');

// 适用于 IME 输入法的 SQLite 字典库
const wordDictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_dict.db'
);
const wordDictImeSQLiteHashFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_dict_db_hash'
);
// 输入法的 SQLite 词典库
const phraseDictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_phrase_dict.db'
);
const phraseDictImeSQLiteHashFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_phrase_dict_db_hash'
);

console.log();
console.log('同步汉字数据到输入法的 SQLite 字典库 ...');
let wordDictDB = await ime.open(wordDictDataSQLiteFile, true);
let imeWordDictDB = await ime.open(wordDictImeSQLiteFile);

try {
  await ime.syncSpells(imeWordDictDB, wordDictDB);
  console.log('- 已同步字读音信息');

  await ime.syncWords(imeWordDictDB, wordDictDB);
  console.log('- 已同步字信息');

  await ime.syncPhrases(imeWordDictDB, wordDictDB);
  console.log('- 已同步词组信息');

  await ime.syncEmojis(imeWordDictDB, wordDictDB);
  console.log('- 已同步表情符号数据');
} catch (e) {
  throw e;
} finally {
  await ime.close(wordDictDB);
  await ime.close(imeWordDictDB);
}

const imeWordDictDBFileHash = fileSHA256(wordDictImeSQLiteFile);
appendLineToFile(wordDictImeSQLiteHashFile, imeWordDictDBFileHash, true);
console.log('- 已记录数据库 Hash 值：' + imeWordDictDBFileHash);

console.log();
