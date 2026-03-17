/* SQLite 字典库 */
import { getWordDictSQLiteFile } from '#db/utils.mjs';

import { readAllSavedWordMetas } from '#data/word/meta.mjs';

import { patchWordMeta } from './patch.mjs';
import * as sqlite from './sqlite.mjs';

// SQLite 字典库
const wordDictSQLiteFile = getWordDictSQLiteFile();

// -----------------------------------------------------------------------------
console.log();
console.log('读取已收集的有效字信息 ...');

const wordMetas = await readAllSavedWordMetas();
wordMetas.forEach((meta) => {
  patchWordMeta(meta);
});

console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

// -----------------------------------------------------------------------------
console.log();
console.log('写入字信息到 SQLite ...');

const db = sqlite.open(wordDictSQLiteFile, { ignoreCheckConstraints: true });
try {
  sqlite.saveSpells(db, wordMetas);
  console.log('- 已保存字读音信息');

  sqlite.saveWords(db, wordMetas);
  console.log('- 已保存字信息');
} catch (e) {
  throw e;
} finally {
  sqlite.close(db);
}

console.log();
