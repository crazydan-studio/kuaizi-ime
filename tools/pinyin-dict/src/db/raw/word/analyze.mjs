import { fromRootPath } from '#utils/utils.mjs';
import { getWordDictSQLiteFile } from '#db/utils.mjs';

import * as sqlite from './sqlite.mjs';

// 分析数据
const pinyinCharsFile = fromRootPath('..', 'analyze/files/pinyin.txt');
const pinyinCharLinksFile = fromRootPath('..', 'analyze/files/char-links.json');
const pinyinCharTreeFile = fromRootPath('..', 'analyze/files/char-tree.json');

// SQLite 字典库
const wordDictSQLiteFile = getWordDictSQLiteFile();

// -----------------------------------------------------------------------------
console.log();
console.log('通过 SQLite 生成分析数据 ...');

const db = sqlite.open(wordDictSQLiteFile);
try {
  sqlite.generatePinyinChars(db, pinyinCharsFile);
  console.log('- 已保存拼音字母组合数据');

  sqlite.generatePinyinCharLinks(db, pinyinCharLinksFile);
  console.log('- 已保存拼音字母关联数据');

  sqlite.generatePinyinCharTree(db, pinyinCharTreeFile);
  console.log('- 已保存拼音字母后继数据');
} catch (e) {
  throw e;
} finally {
  sqlite.close(db);
}

console.log();
