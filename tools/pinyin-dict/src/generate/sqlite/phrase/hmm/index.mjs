/* 生成 HMM 计算参数 */
import { fromRootPath, appendLineToFile } from '../../../../utils/utils.mjs';
import { openDB, closeDB } from '../../../../utils/sqlite.mjs';
import * as hmm from './hmm.mjs';

// SQLite 字典库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');
// HMM 参数目录
const hmmParamsDir = fromRootPath('data', 'hmm_params');
// 样本文件目录
const phraseSamplesDir = fromRootPath('data', 'hmm_params/samples');

console.log();
console.log('创建 HMM 计算参数 ...');
let wordDictDB = await openDB(wordDictSQLiteFile, true);
let phrases;

try {
  phrases = await hmm.readSamples(phraseSamplesDir, wordDictDB);
} catch (e) {
  throw e;
} finally {
  await closeDB(wordDictDB);
}

const hmmParams = hmm.countHmmParams(phrases);
Object.keys(hmmParams).forEach((name) => {
  appendLineToFile(
    hmmParamsDir + `/${name}.json`,
    JSON.stringify(hmmParams[name], null, 2),
    true
  );
});

console.log('- 已创建 HMM 计算参数');
console.log();
