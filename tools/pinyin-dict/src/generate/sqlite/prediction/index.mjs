/* 词组预测的 SQLite 词库 */
import {
  fromRootPath,
  fileSHA256,
  appendLineToFile,
  readJSONFromFile
} from '../../../utils/utils.mjs';
import * as prediction from './prediction.mjs';

// 包含完整拼音和字信息的 SQLite 数据库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// HMM 参数目录
const hmmParamsDir = fromRootPath(
  '../..',
  'data/Pinyin2ChineseChars/model_params'
);
// 词组预测的 SQLite 数据库
const predDictSQLiteFile = fromRootPath('data', 'pinyin-pred-dict.sqlite');
// 输入法词组预测的 SQLite 数据库
const dictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_pred_dict.db'
);
const dictImeSQLiteHashFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_pred_dict_db_hash'
);

console.log();
console.log('创建词组预测的 SQLite 库 ...');
let wordDictDB = await prediction.open(wordDictSQLiteFile, true);
let predDictDB = await prediction.open(predDictSQLiteFile);

try {
  await prediction.updateData(predDictDB, wordDictDB, {
    // 初始概率矩阵：单字的使用概率
    init_prob: readJSONFromFile(hmmParamsDir + '/init_prob.json'),
    // 汉字-拼音发射概率矩阵：字的对应拼音（多音字）的使用概率，概率为 0 的表示单音字
    emiss_prob: readJSONFromFile(hmmParamsDir + '/emiss_prob.json'),
    // 汉字间转移概率矩阵：当前字与前一个字的关联概率
    trans_prob: readJSONFromFile(hmmParamsDir + '/trans_prob.json'),
    // 拼音中的字列表
    pinyin_states: readJSONFromFile(hmmParamsDir + '/pinyin_states.json')
  });
  console.log('- 已创建词库');
} catch (e) {
  throw e;
} finally {
  await prediction.close(wordDictDB);
  await prediction.close(predDictDB);
}

// appendLineToFile(
//   hmmParamsDir + '/trans_prob.json',
//   JSON.stringify(readJSONFromFile(hmmParamsDir + '/trans_prob.json'), null, 2),
//   true
// );

// Note：去掉 id 列以减少数据库文件大小
// const imeDictDBFileHash = fileSHA256(predDictSQLiteFile);
// appendLineToFile(dictImeSQLiteHashFile, imeDictDBFileHash, true);
// console.log('- 已记录数据库 Hash 值：' + imeDictDBFileHash);

console.log();
