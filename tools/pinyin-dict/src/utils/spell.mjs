import GraphemeSplitter from 'grapheme-splitter';

const graphemeSplitter = new GraphemeSplitter();

/** 部分中文和表情符号等占用字节数大于 2，比如: 𫫇，需单独处理 */
export function splitChars(str) {
  // https://github.com/orling/grapheme-splitter
  return graphemeSplitter.splitGraphemes(str);
}

/** Note: 拼音始终都是有声调的，纯字母组合的拼音实际可视为零声（轻声） */

/** 修正拼音 */
export function correctPinyin(pinyin) {
  switch (pinyin) {
    case 'yòu ㄧ':
      pinyin = 'yòu';
      break;
    case 'ka1':
      pinyin = 'kā';
      break;
    case 'mò qí':
      pinyin = 'mò';
      break;
    case 'no4u':
      pinyin = 'nòu';
      break;
    case 'so4u':
      pinyin = 'sòu';
      break;
    case 'ê̄':
    case 'ê1/ei1':
      pinyin = 'ēi';
      break;
    case 'ế':
    case 'ê2/ei2':
      pinyin = 'éi';
      break;
    case 'ê̌':
    case 'ê̌̌':
    case 'ê3/ei3':
      pinyin = 'ěi';
      break;
    case 'ề':
    case 'ê4/ei4':
      pinyin = 'èi';
      break;
    case 'jǔ yǔ':
      pinyin = 'jǔ';
      break;
    case 'zheng1':
      pinyin = 'zhēng';
      break;
    case 'gūi':
      pinyin = 'guī';
      break;
  }

  return pinyin
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
    .replaceAll('ê', 'ē')
    .replaceAll(/[·]/g, '');
}

/** 修正注音 */
export function correctZhuyin(str) {
  return str.replaceAll('π', 'ㄫ').replaceAll('˙', '');
}

/** 将拼音转换为以数字（0-4）代表声调的拼音，如 hàn -> han4 */
export function toNumberTonePinyin(pinyin, withoutZeroTone = false) {
  const tone = getPinyinTone(pinyin);

  return zeroPinyinTone(pinyin) + (withoutZeroTone && tone == 0 ? '' : tone);
}

/** 去掉拼音的声调，将其变为零声（轻声） */
export function zeroPinyinTone(pinyin) {
  if ('m̀' === pinyin || 'ḿ' === pinyin || 'm̄' === pinyin) {
    return 'm';
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
    // Note: 以下为 ei 的专有形式，需将其替换为 ei
    // ê: 0,
    // ê̄: 1,
    // ế: 2,
    // ê̌: 3,
    // ề: 4,
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

/** 去掉注音的声调，将其变为零声（轻声） */
export function zeroZhuyinTone(zhuyin) {
  return zhuyin.replaceAll(/[ˊˇˋˉ˙]/g, '');
}
