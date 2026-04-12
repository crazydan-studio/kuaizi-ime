import * as path from 'path';

import { fromRootPath } from '#utils/file.mjs';

import * as sqlite from './lib/sqlite.mjs';

const siteRootDir = fromRootPath('../../site/hanzi.crazydan.io');

const siteAssetsDir = path.join(siteRootDir, 'public/assets');
const siteAssetsDBFile = path.join(siteAssetsDir, 'db.sqlite');

console.log();
console.log('计算并保存所有汉字笔画路径的中轴线 ...');

const db = sqlite.open(siteAssetsDBFile);
try {
  sqlite.saveStrokeMedialAxes(db, 50000);
  console.log('- 已保存笔画路径中轴线');
} finally {
  sqlite.close(db);
}

console.log();
