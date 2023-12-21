import { pinyin as get_pinyin } from 'pinyin';

import { appendLineToFile } from '../../../../utils/utils.mjs';

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
  const phrases = split(sampleText, words);

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
  const excludes = ['丨'];

  let phrase_size = 0;
  const total = sampleText.length;
  for (let i = 0; i <= total; i++) {
    const word = sampleText.charAt(i);

    if (words[word] && !excludes.includes(word)) {
      phrase_size += 1;
      continue;
    }

    // 忽略单字
    if (phrase_size > 1) {
      const phrase = sampleText.substring(i - phrase_size, i);
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

      // 直接按 字:拼音 进行统计，故，无需再计算 拼音-汉字发射概率
      phrases.push(
        pinyins.map((pinyin, index) => {
          let word = phrase.charAt(index);

          if (word == '不' && pinyin == 'bú') {
            pinyin = 'bù';
          } else if (word == '么' && pinyin == 'mǒ') {
            pinyin = 'me';
          } else if (word == '什' && pinyin == 'shèn') {
            pinyin = 'shén';
          } else if (word == '进' && pinyin == 'jǐn') {
            pinyin = 'jìn';
          } else if (word == '骨' && pinyin == 'gú') {
            pinyin = 'gǔ';
          } else if (word == '喝' && pinyin == 'he') {
            pinyin = 'hē';
          } else if (word == '尘' && pinyin == 'chen') {
            pinyin = 'chén';
          } else if (word == '乌' && pinyin == 'wù') {
            pinyin = 'wū';
          } else if (word == '滂' && pinyin == 'páng') {
            pinyin = 'pāng';
          } else if (word == '蒙' && pinyin == 'meng') {
            pinyin = phrase.charAt(index + 1) == '古' ? 'měng' : 'méng';
          } else if (word == '一' && ['yí', 'yì'].includes(pinyin)) {
            pinyin = 'yī';
          } else if (word == '拉' && ['là', 'la'].includes(pinyin)) {
            pinyin = 'lā';
          }

          return `${word}:${pinyin}`;
        })
      );
    }
    phrase_size = 0;
  }

  return phrases;
}

/** 计算汉字（状态）间转移概率：每个句子中汉字转移概率 */
function countTrans(phrases, exist_trans_prob) {
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
