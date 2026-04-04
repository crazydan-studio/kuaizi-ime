import * as path from 'path';

import { fromRootPath, getAllFiles } from '#utils/file.mjs';

import * as sqlite from './lib/sqlite.mjs';

const siteRootDir = fromRootPath('../../site/hanzi.crazydan.io');

const siteAssetsDir = path.join(siteRootDir, 'public/assets');
const siteAssetsZiDir = path.join(siteAssetsDir, 'zi');
const siteAssetsDBFile = path.join(siteAssetsDir, 'db.sqlite');

// ---------------------------------------------
console.log();
console.log('获取所有汉字的笔画 SVG 图 ...');
const ziStrokeSvgFiles = getAllFiles(siteAssetsZiDir).filter(
  (file) => path.basename(file) == 'stroke.svg'
);

console.log('- 已获取汉字笔画图：' + ziStrokeSvgFiles.length);
console.log();

// ---------------------------------------------
console.log();
console.log('保存所有汉字的笔画路径 ...');

const db = sqlite.open(siteAssetsDBFile);
try {
  sqlite.saveStrokeSvgPaths(db, ziStrokeSvgFiles);
  console.log('- 已保存笔画路径');
} finally {
  sqlite.close(db);
}

console.log();
