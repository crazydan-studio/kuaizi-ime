import { appendLineToFile } from '#utils/utils.mjs';
import { extractClauses } from '../../utils.mjs';

export async function readWords(wordDictDB) {
  const words = {};
  (await wordDictDB.all(`select word_, spell_ from pinyin_word`)).forEach(
    (row) => {
      const { word_, spell_ } = row;

      words[word_] ||= [];
      words[word_].push(spell_);
    }
  );

  return words;
}

/**
 * HMM 参数计算
 * trans_prob - 汉字间转移概率
 */
export function countParams(sampleText, words, existParams, debugDataFile) {
  const clauses = extractClauses(sampleText, words);

  if (debugDataFile) {
    appendLineToFile(debugDataFile, JSON.stringify(clauses, null, 2), true);
  }

  existParams = existParams || { word_prob: {}, trans_prob: {} };

  return {
    // 字的出现次数
    word_prob: countWords(clauses, existParams.word_prob),
    // 当前字为 EOS 且其前序为 BOS 的转移次数即为 训练的句子总数，
    // 而各个包含 BOS 前序的字即为句首字，且其出现次数即为 BOS 的值
    trans_prob: countTrans(clauses, existParams.trans_prob)
  };
}

/** 计算汉字（状态）间转移概率：每个句子中汉字转移概率 */
export function countTrans(clauses, existTransProb) {
  const transProb = existTransProb || {};

  clauses.forEach((clause) => {
    for (let i = 0; i <= clause.length; i++) {
      const curr = i == clause.length ? 'EOS' : clause[i];
      const prev = i == 0 ? 'BOS' : clause[i - 1];

      const prob = (transProb[curr] = transProb[curr] || {});

      prob[prev] = (prob[prev] || 0) + 1;
      // 转移概率: math.log(前序字出现次数 / total)
      prob.__total__ = (prob.__total__ || 0) + 1;
    }
  });

  return transProb;
}

export function countWords(clauses, existWordProp) {
  const wordProb = existWordProp || {};

  clauses.forEach((clause) => {
    for (let i = 0; i < clause.length; i++) {
      const curr = clause[i];

      wordProb[curr] ||= 0;
      wordProb[curr] += 1;
    }
  });

  return wordProb;
}
