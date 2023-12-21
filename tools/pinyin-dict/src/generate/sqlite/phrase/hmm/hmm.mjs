import { pinyin as get_pinyin } from 'pinyin';

import { readAllFiles } from '../../../../utils/utils.mjs';

export async function readSamples(dir, wordDictDB) {
  const words = {};
  (await wordDictDB.all(`select value_ from meta_word`)).forEach((row) => {
    const { value_ } = row;
    words[value_] = true;
  });

  const sampleTexts = readAllFiles(dir);
  return split(sampleTexts.join('\n'), words);
}

// split('力争达到１０００万标准箱\n', {
//   力: true,
//   争: true,
//   达: true,
//   到: true,
//   万: true,
//   标: true,
//   准: true,
//   箱: true
// });
/** 拆分样本数据，按汉字短句返回 */
function split(sampleText, words) {
  const phrases = [];

  let phrase_size = 0;
  const total = sampleText.length;
  for (let i = 0; i <= total; i++) {
    const word = sampleText.charAt(i);

    if (words[word] && word != '丨') {
      phrase_size += 1;
      continue;
    }

    // 忽略单字
    if (phrase_size > 1) {
      const phrase = sampleText.substring(i - phrase_size, i);
      phrases.push(phrase);
    }
    phrase_size = 0;
  }

  return phrases;
}

/**
 * HMM 参数计算
 * init_prob - 汉字初始概率
 * emiss_prob - 拼音对多音汉字的发射概率
 * trans_prob - 汉字间转移概率
 */
export function countHmmParams(phrases) {
  return {
    init_prob: countInit(phrases),
    emiss_prob: countEmiss(phrases),
    trans_prob: countTrans(phrases)
  };
}

/** 计算汉字初始概率：每个汉字作为句首的概率 */
function countInit(phrases) {
  const init_prob = {
    // 首字概率: math.log(首字出现次数 / total)
    __total__: phrases.length
  };

  phrases.forEach((phrase) => {
    const start = phrase.charAt(0);

    init_prob[start] = (init_prob[start] || 0) + 1;
  });

  return init_prob;
}

/**
 * 计算 拼音-汉字发射概率：每个拼音对应的汉字以及次数（多音汉字即为拼音的状态）
 *
 * 状态（汉字）的发射概率
 * 观察序列 - 拼音串
 * emiss_prob = {
 *         word1 : {pinyin11: num11, pinyin12: num12, ...},
 *         word2 : {pinyin21: num21, pinyin22: num22, ...},
 *         ...
 * }
 */
function countEmiss(phrases) {
  const emiss_prob = {};

  phrases.forEach((phrase) => {
    // https://www.npmjs.com/package/pinyin/v/3.1.0
    const pinyins = get_pinyin(phrase, {
      // 不启用多音字模式，仅返回每个汉字第一个匹配的拼音
      heteronym: false,
      // 启用分词，以解决多音字问题
      segment: true,
      // 输出拼音格式：含声调，如，pīn yīn
      style: get_pinyin.STYLE_TONE,
      // 紧凑模式：你好吗 -> [ [nǐ,hǎo,ma], [nǐ,hǎo,má], ... ]
      compact: true
    })[0];

    for (let i = 0; i < phrase.length; i++) {
      const word = phrase.charAt(i);
      const pinyin = pinyins[i];

      const emiss = (emiss_prob[word] = emiss_prob[word] || {});

      emiss[pinyin] = (emiss[pinyin] || 0) + 1;
      // 发射概率: math.log(拼音出现次数 / total)
      emiss.__total__ = (emiss.__total__ || 0) + 1;
    }
  });

  return emiss_prob;
}

/** 计算汉字（状态）间转移概率：每个句子中汉字转移概率 */
function countTrans(phrases) {
  const trans_prob = {};

  phrases.forEach((phrase) => {
    for (let i = 0; i <= phrase.length; i++) {
      const curr = i == phrase.length ? 'EOS' : phrase.charAt(i);
      const prev = i == 0 ? 'BOS' : phrase.charAt(i - 1);

      const trans = (trans_prob[curr] = trans_prob[curr] || {});

      trans[prev] = (trans[prev] || 0) + 1;
      // 转移概率: math.log(前序字出现次数 / total)
      trans.__total__ = (trans.__total__ || 0) + 1;
    }
  });

  return trans_prob;
}
