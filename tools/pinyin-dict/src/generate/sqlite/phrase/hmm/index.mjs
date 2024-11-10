/* SQLite 词典库 */
import { fromRootPath, readJSONFromFile } from '#utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

// SQLite 字典库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');
// HMM 参数目录
const transParamsDir = fromRootPath('data/hmm_params/kewen');
// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');

console.log();
console.log('创建 SQLite 词典库（累积更新） ...');
let wordDictDB = await sqlite.open(wordDictSQLiteFile, true);
let phraseDictDB = await sqlite.open(phraseDictSQLiteFile);

try {
  // TODO 通过参数控制是否累积更新
  await sqlite.updateData(phraseDictDB, wordDictDB, {
    word_prob: readJSONFromFile(transParamsDir + '/word_prob.json'),
    // 汉字间转移概率矩阵：当前字与前一个字的关联概率
    trans_prob: readJSONFromFile(transParamsDir + '/trans_prob.json')
  });
  console.log('- 已创建词典库');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(wordDictDB);
  await sqlite.close(phraseDictDB);
}

console.log();
