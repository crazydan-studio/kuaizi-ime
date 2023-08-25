/* 供输入法使用的 SQLite 数据库 */
import {
  fromRootPath,
  fileSHA256,
  appendLineToFile
} from '../../../utils/utils.mjs';
import * as ime from './ime.mjs';

// 包含完整拼音和字信息的 SQLite 数据库
const dictDataSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// 适用于 IME 输入法的拼音字典 SQLite 数据库
const dictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_dict.db'
);
const dictImeSQLiteHashFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_dict_db_hash'
);

console.log();
console.log('同步汉字数据到输入法 SQLite 库 ...');
let fullDictDB = await ime.open(dictDataSQLiteFile, true);
let imeDictDB = await ime.open(dictImeSQLiteFile);

try {
  await ime.syncSpells(imeDictDB, fullDictDB);
  console.log('- 已同步字读音信息');

  await ime.syncWords(imeDictDB, fullDictDB);
  console.log('- 已同步字信息');

  await ime.syncPhrases(imeDictDB, fullDictDB);
  console.log('- 已同步词组信息');

  await ime.syncEmojis(imeDictDB, fullDictDB);
  console.log('- 已同步表情符号数据');
} catch (e) {
  console.error(e);
} finally {
  await ime.close(fullDictDB);
  await ime.close(imeDictDB);
}

const imeDictDBFileHash = fileSHA256(dictImeSQLiteFile);
appendLineToFile(dictImeSQLiteHashFile, imeDictDBFileHash, true);
console.log('- 已记录数据库 Hash 值：' + imeDictDBFileHash);

console.log();
