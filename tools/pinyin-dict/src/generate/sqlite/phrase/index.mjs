/* SQLite 词典库 */
import {
  fromRootPath,
  fileSHA256,
  appendLineToFile,
  readJSONFromFile
} from '../../../utils/utils.mjs';
import * as phrase from './phrase.mjs';

// SQLite 字库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// HMM 参数目录
const hmmParamsDir = fromRootPath(
  '../..',
  'data/Pinyin2ChineseChars/model_params'
);
// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');
// 输入法的 SQLite 词典库
const phraseDictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_phrase_dict.db'
);
const phraseDictImeSQLiteHashFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_phrase_dict_db_hash'
);

console.log();
console.log('创建 SQLite 词典库 ...');
let wordDictDB = await phrase.open(wordDictSQLiteFile, true);
let phraseDictDB = await phrase.open(phraseDictSQLiteFile);

try {
  await phrase.updateData(phraseDictDB, wordDictDB, {
    // 初始概率矩阵：单字的使用概率
    init_prob: readJSONFromFile(hmmParamsDir + '/init_prob.json'),
    // 汉字-拼音发射概率矩阵：字的对应拼音（多音字）的使用概率，概率为 0 的表示单音字
    emiss_prob: readJSONFromFile(hmmParamsDir + '/emiss_prob.json'),
    // 汉字间转移概率矩阵：当前字与前一个字的关联概率
    trans_prob: readJSONFromFile(hmmParamsDir + '/trans_prob.json'),
    // 拼音中的字列表
    pinyin_states: readJSONFromFile(hmmParamsDir + '/pinyin_states.json')
  });
  console.log('- 已创建词典库');
} catch (e) {
  throw e;
} finally {
  await phrase.close(wordDictDB);
  await phrase.close(phraseDictDB);
}

// appendLineToFile(
//   hmmParamsDir + '/trans_prob.json',
//   JSON.stringify(readJSONFromFile(hmmParamsDir + '/trans_prob.json'), null, 2),
//   true
// );

// const imeDictDBFileHash = fileSHA256(predDictSQLiteFile);
// appendLineToFile(dictImeSQLiteHashFile, imeDictDBFileHash, true);
// console.log('- 已记录数据库 Hash 值：' + imeDictDBFileHash);

console.log();
