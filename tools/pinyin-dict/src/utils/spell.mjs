import GraphemeSplitter from 'grapheme-splitter';

import { pinyin as parsePinyin, addDict } from 'pinyin-pro';
// https://pinyin-pro.cn/use/addDict.html
import CompleteDict from '@pinyin-pro/data/complete';

addDict(CompleteDict);

const graphemeSplitter = new GraphemeSplitter();

/** 部分中文和表情符号等占用字节数大于 2，比如: 𫫇，需单独处理 */
export function splitChars(str) {
  // https://github.com/orling/grapheme-splitter
  return graphemeSplitter.splitGraphemes(str);
}

/** @return ['nǐ', 'hǎo', 'ma'] */
export function getPinyin(str) {
  // https://pinyin-pro.cn/use/pinyin.html
  return parsePinyin(str, {
    // 输出为数组
    type: 'array',
    // 作为音调符号带在拼音字母上
    toneType: 'symbol',
    // 识别字符串开头的姓氏
    surname: 'head',
    // 是否对一和不应用智能变调
    // 不（bù）在去声字前面读阳平声，如“～会”“～是”，这属于变调读音
    // http://www.moe.gov.cn/jyb_hygq/hygq_zczx/moe_1346/moe_1364/tnull_42118.html
    // “一”和“不”变调有规律：https://www.chinanews.com.cn/hwjy/news/2010/04-15/2228742.shtml
    toneSandhi: true
  });
}

/** 修正拼音 */
export function correctPinyin(str) {
  switch (str) {
    case 'yòu ㄧ':
      str = 'yòu';
      break;
    case 'ka1':
      str = 'kā';
      break;
    case 'mò qí':
      str = 'mò';
      break;
    case 'no4u':
      str = 'nòu';
      break;
    case 'so4u':
      str = 'sòu';
      break;
    case 'ê1/ei1':
      str = 'ēi';
      break;
    case 'ê2/ei2':
      str = 'éi';
      break;
    case 'ê3/ei3':
      str = 'ěi';
      break;
    case 'ê4/ei4':
      str = 'èi';
      break;
    case 'ê̌̌':
      str = 'ê̌';
      break;
    case 'jǔ yǔ':
      str = 'jǔ';
      break;
    case 'zheng1':
      str = 'zhēng';
      break;
  }

  return str
    .replaceAll('ā', 'ā')
    .replaceAll('ă', 'ǎ')
    .replaceAll('à', 'à')
    .replaceAll('ɑ', 'a')
    .replaceAll('ō', 'ō')
    .replaceAll('ŏ', 'ǒ')
    .replaceAll('ī', 'ī')
    .replaceAll('ĭ', 'ǐ')
    .replaceAll('ŭ', 'ǔ')
    .replaceAll('ɡ', 'g')
    .replaceAll('ē', 'ē')
    .replaceAll(/[·]/g, '');
}

/** 修正注音 */
export function correctZhuyin(str) {
  return str.replaceAll('π', 'ㄫ').replaceAll('˙', '');
}

/** 拼音去掉声调后的字母组合 */
export function extractPinyinChars(pinyin) {
  if ('m̀' === pinyin || 'ḿ' === pinyin || 'm̄' === pinyin) {
    return 'm';
  } else if (
    'ê̄' === pinyin ||
    'ế' === pinyin ||
    'ê̌' === pinyin ||
    'ề' === pinyin
  ) {
    return 'e';
  }

  const chars = [];

  const splits = splitChars(pinyin);
  for (let i = 0; i < splits.length; i++) {
    const ch = splits[i];
    switch (ch) {
      case 'ā':
      case 'á':
      case 'ǎ':
      case 'à':
        chars.push('a');
        break;
      case 'ō':
      case 'ó':
      case 'ǒ':
      case 'ò':
        chars.push('o');
        break;
      case 'ē':
      case 'é':
      case 'ě':
      case 'è':
      case 'ê':
        chars.push('e');
        break;
      case 'ī':
      case 'í':
      case 'ǐ':
      case 'ì':
        chars.push('i');
        break;
      case 'ū':
      case 'ú':
      case 'ǔ':
      case 'ù':
        chars.push('u');
        break;
      case 'ǖ':
      case 'ǘ':
      case 'ǚ':
      case 'ǜ':
        chars.push('ü');
        break;
      case 'ń':
      case 'ň':
      case 'ǹ':
        chars.push('n');
        break;
      default:
        chars.push(ch);
    }
  }

  return chars.join('');
}

export function getPinyinTone(pinyin) {
  const tones = {
    ā: 1,
    á: 2,
    ǎ: 3,
    à: 4,
    //
    ō: 1,
    ó: 2,
    ǒ: 3,
    ò: 4,
    //
    ē: 1,
    é: 2,
    ě: 3,
    è: 4,
    ê: 0,
    ê̄: 1,
    ế: 2,
    ê̌: 3,
    ề: 4,
    //
    ī: 1,
    í: 2,
    ǐ: 3,
    ì: 4,
    //
    ū: 1,
    ú: 2,
    ǔ: 3,
    ù: 4,
    //
    ǖ: 1,
    ǘ: 2,
    ǚ: 3,
    ǜ: 4,
    //
    ń: 2,
    ň: 3,
    ǹ: 4,
    //
    m̄: 1,
    ḿ: 2,
    m̀: 4
  };

  for (let ch in tones) {
    if (pinyin.includes(ch)) {
      return tones[ch];
    }
  }

  return 0;
}

/** 注音去掉声调后的字符组合 */
export function extractZhuyinChars(zhuyin) {
  return zhuyin.replaceAll(/[ˊˇˋˉ˙]/g, '');
}
