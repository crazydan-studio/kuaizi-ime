// 获取汉字的图片、读音、笔顺动画等多媒体文件资源
import { fromRootPath } from '#utils/file.mjs';

import { readAllValidZiMetas } from './meta.mjs';

import { fetchAndSaveZiMedias, patchZiMedias } from './lib/media.mjs';

const siteAssetsDir = fromRootPath('data', 'media');

// ---------------------------------------------------------------
console.log();
console.log('读取已收集的有效字信息 ...');
const ziMetas = readAllValidZiMetas();

console.log('- 有效字信息总数：' + ziMetas.length);
console.log();

// ---------------------------------------------------------------
console.log();
console.log('获取与字相关的媒体信息 ...');
const ziMedias = await patchZiMedias(ziMetas);

console.log('- 拼音媒体总数：' + Object.keys(ziMedias.pinyins).length);
console.log();

// ---------------------------------------------------------------
console.log();
console.log('保存与字相关的媒体文件 ...');
await fetchAndSaveZiMedias(ziMedias, siteAssetsDir);

console.log();
console.log('采集完毕！');
console.log();
