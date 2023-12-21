/* 生成 HMM 计算参数 */
import {
  fromRootPath,
  appendLineToFile,
  getAllFiles,
  readFile
} from '../../../../utils/utils.mjs';
import { openDB, closeDB } from '../../../../utils/sqlite.mjs';
import * as hmm from './hmm.mjs';

// SQLite 字典库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');
// HMM 参数目录
const hmmParamsDir = fromRootPath('data', 'hmm_params');
// 样本文件目录
// 可以从 https://github.com/Lancer-He/pinyin_IME_HMM 中获取样本
const phraseSamplesDir = fromRootPath('data', 'hmm_params/samples');

console.log();
console.log('创建 HMM 计算参数 ...');
let wordDictDB = await openDB(wordDictSQLiteFile, true);

let words;
try {
  words = await hmm.readWords(wordDictDB);
} catch (e) {
  throw e;
} finally {
  await closeDB(wordDictDB);
}

let hmmParams;
getAllFiles(phraseSamplesDir).forEach((file) => {
  const debugSuffix = '.debug';
  if (file.endsWith(debugSuffix)) {
    return;
  }

  const sampleText = readFile(file);
  console.log(`- 分析文件: ${file}`);

  hmmParams = hmm.countParams(
    sampleText,
    words,
    hmmParams,
    `${file}${debugSuffix}`
  );
});

Object.keys(hmmParams).forEach((name) => {
  appendLineToFile(
    hmmParamsDir + `/${name}.json`,
    JSON.stringify(hmmParams[name], null, 2),
    true
  );
});

console.log();
console.log('Done');
console.log();
