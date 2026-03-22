// 获取汉字的图片、读音、笔顺动画等多媒体文件资源
import { fromRootPath } from '#utils/file.mjs';

import { readAllSavedWordMetas } from '#data/word/meta.mjs';

import { fetchAndSaveWordMedias } from './media.mjs';
import { patchWordMedias } from './patch.mjs';

const wordMediasDir = fromRootPath('data', 'medias');

// ---------------------------------------------------------------
console.log();
console.log('读取已收集的有效字信息 ...');
const wordMetas = await readAllSavedWordMetas();

console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

// ---------------------------------------------------------------
console.log();
console.log('获取与字相关的媒体信息 ...');
const wordMedias = await patchWordMedias(wordMetas);

console.log('- 拼音媒体总数：' + Object.keys(wordMedias.pinyins).length);
console.log('- 字媒体总数：' + wordMedias.words.length);
console.log();

// ---------------------------------------------------------------
console.log();
console.log('保存与字相关的媒体文件 ...');
await fetchAndSaveWordMedias(wordMedias, wordMediasDir);
