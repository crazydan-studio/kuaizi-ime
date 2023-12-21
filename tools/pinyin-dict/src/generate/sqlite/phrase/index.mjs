/* SQLite 词典库 */
import { fromRootPath, readJSONFromFile } from '../../../utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

// SQLite 字典库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');
// HMM 参数目录
const hmmParamsDir = fromRootPath('data/hmm_params');
// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');

console.log();
console.log('创建 SQLite 词典库 ...');
let wordDictDB = await sqlite.open(wordDictSQLiteFile, true);
let phraseDictDB = await sqlite.open(phraseDictSQLiteFile);

try {
  await sqlite.updateData(phraseDictDB, wordDictDB, {
    // 初始概率矩阵：每个汉字作为句首的概率
    init_prob: readJSONFromFile(hmmParamsDir + '/init_prob.json'),
    // 汉字-拼音发射概率矩阵：字的对应拼音（多音字）的使用概率，概率为 0 的表示单音字
    emiss_prob: readJSONFromFile(hmmParamsDir + '/emiss_prob.json'),
    // 汉字间转移概率矩阵：当前字与前一个字的关联概率
    trans_prob: readJSONFromFile(hmmParamsDir + '/trans_prob.json')
  });
  console.log('- 已创建词典库');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(wordDictDB);
  await sqlite.close(phraseDictDB);
}

console.log();
