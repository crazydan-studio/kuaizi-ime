import { fromRootPath } from '#utils/utils.mjs';
import {
  fetchAndSaveAllKeWen,
  fetchAndSaveAllGushi,
  fetchAndSaveAllGuci
} from './phrase.mjs';

// 采集 古文之家(https://www.cngwzj.com) 的数据
// 语文课文
const kewenDataRawFile = fromRootPath('data', 'pinyin-dict-kewen.raw.txt');
// 古诗
const gushiDataRawFile = fromRootPath('data', 'pinyin-dict-gushi.raw.txt');
// 古词
const guciDataRawFile = fromRootPath('data', 'pinyin-dict-guci.raw.txt');
const enableDump = false;

console.log();
console.log('拉取课文数据 ...');
await fetchAndSaveAllKeWen(kewenDataRawFile, enableDump);

console.log();
console.log('拉取古诗数据 ...');
await fetchAndSaveAllGushi(gushiDataRawFile, enableDump);

console.log();
console.log('拉取古词数据 ...');
await fetchAndSaveAllGuci(guciDataRawFile, enableDump);

console.log();
console.log('Done!');
console.log();
