/**
 * 从字典库中读取字及其拼音
 *
 * @returns 结构为 <pre>{'字': ['zì'], ...}</pre>
 */
export async function readWordsFromDB(wordDictDB) {
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
 * 计算汉字（状态）间转移概率：每个句子中汉字转移概率
 *
 * @param clauses 结构为 <pre>[['字:zì', ...], [...], ...]</pre>
 */
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

/**
 * 统计短语中的汉字数量
 *
 * @param clauses 结构为 <pre>[['字:zì', ...], [...], ...]</pre>
 */
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
