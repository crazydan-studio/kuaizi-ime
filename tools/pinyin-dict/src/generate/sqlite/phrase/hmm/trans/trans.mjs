import { appendLineToFile } from '#utils/utils.mjs';
import {extract_phrases} from '../../utils.mjs';

export async function readWords(wordDictDB) {
  const words = {};
  (await wordDictDB.all(`select value_ from meta_word`)).forEach((row) => {
    const { value_ } = row;
    words[value_] = true;
  });

  return words;
}

/**
 * HMM 参数计算
 * trans_prob - 汉字间转移概率
 */
export function countParams(sampleText, words, exist_params, debugDataFile) {
  const phrases = extract_phrases(sampleText, words);

  if (debugDataFile) {
    appendLineToFile(debugDataFile, JSON.stringify(phrases, null, 2), true);
  }

  exist_params = exist_params || { trans_prob: {} };

  return {
    // 当前字为 EOS 且其前序为 BOS 的转移次数即为 训练的句子总数，
    // 而各个包含 BOS 前序的字即为句首字，且其出现次数即为 BOS 的值
    trans_prob: countTrans(phrases, exist_params.trans_prob)
  };
}

/** 计算汉字（状态）间转移概率：每个句子中汉字转移概率 */
export function countTrans(phrases, exist_trans_prob) {
  const trans_prob = exist_trans_prob || {};

  phrases.forEach((phrase) => {
    for (let i = 0; i <= phrase.length; i++) {
      const curr = i == phrase.length ? 'EOS' : phrase[i];
      const prev = i == 0 ? 'BOS' : phrase[i - 1];

      const trans = (trans_prob[curr] = trans_prob[curr] || {});

      trans[prev] = (trans[prev] || 0) + 1;
      // 转移概率: math.log(前序字出现次数 / total)
      trans.__total__ = (trans.__total__ || 0) + 1;
    }
  });

  return trans_prob;
}
