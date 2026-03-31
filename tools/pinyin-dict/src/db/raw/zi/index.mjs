/* SQLite 字典库 */
import { getZiDictSQLiteFile } from '#db/utils.mjs';

import { readAllSavedZiMetas } from '#data/zi/meta.mjs';

import { patchZiMeta } from './patch.mjs';
import * as sqlite from './sqlite.mjs';

// SQLite 字典库
const ziDictSQLiteFile = getZiDictSQLiteFile();

// -----------------------------------------------------------------------------
console.log();
console.log('读取已收集的有效字信息 ...');

const ziMetas = await readAllSavedZiMetas();
ziMetas.forEach((meta) => {
  patchZiMeta(meta);
});

console.log('- 有效字信息总数：' + ziMetas.length);
console.log();

// -----------------------------------------------------------------------------
console.log();
console.log('写入字信息到 SQLite ...');

const db = sqlite.open(ziDictSQLiteFile, { ignoreCheckConstraints: true });
try {
  sqlite.saveSpells(db, ziMetas);
  console.log('- 已保存字读音信息');

  sqlite.saveZies(db, ziMetas);
  console.log('- 已保存字信息');
} catch (e) {
  throw e;
} finally {
  sqlite.close(db);
}

console.log();
