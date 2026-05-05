import * as path from 'path';

import { fromRootPath } from '#utils/file.mjs';

import { readAllSavedZiMetas } from '#data/zi/meta.mjs';

import * as sqlite from './lib/sqlite.mjs';

const siteRootDir = fromRootPath('../../site/hanzi.crazydan.io');

const siteDataZiDBFile = path.join(siteRootDir, 'data/zi.db');

// ---------------------------------------------------------------
console.log();
console.log('读取已收集的有效字信息 ...');
const ziMetas = await readAllSavedZiMetas();

console.log('- 有效字信息总数：' + ziMetas.length);
console.log();

// -----------------------------------------------------------------------------
console.log();
console.log('保存字基础信息 ...');

const db = sqlite.open(siteDataZiDBFile);
try {
  sqlite.saveZies(db, ziMetas);
  console.log('- 已保存字信息');
} finally {
  sqlite.close(db);
}

// ---------------------------------------------------------------
console.log();
