import { fromRootPath } from '#utils/file.mjs';
import { openDB, closeDB } from '#utils/sqlite.mjs';

import { getZiDictSQLiteFile } from '#db/utils.mjs';

import {
  genPinyinChars,
  genPinyinCharLinks,
  genPinyinCharTree
} from './analyze.mjs';

// 分析数据
const pinyinCharsFile = fromRootPath('..', 'analyze/files/pinyin.txt');
const pinyinCharLinksFile = fromRootPath('..', 'analyze/files/char-links.json');
const pinyinCharTreeFile = fromRootPath('..', 'analyze/files/char-tree.json');

// SQLite 字典库
const ziDictSQLiteFile = getZiDictSQLiteFile();

// -----------------------------------------------------------------------------
console.log();
console.log('通过 SQLite 生成分析数据 ...');

const db = openDB(ziDictSQLiteFile);
try {
  genPinyinChars(db, pinyinCharsFile);
  console.log('- 已保存拼音字母组合数据');

  genPinyinCharLinks(db, pinyinCharLinksFile);
  console.log('- 已保存拼音字母关联数据');

  genPinyinCharTree(db, pinyinCharTreeFile);
  console.log('- 已保存拼音字母后继数据');
} catch (e) {
  throw e;
} finally {
  closeDB(db);
}

console.log();
