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
    case 'wān ㄨㄢ':
      pinyin = 'wān';
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
    case 'tíì':
      pinyin = 'tí';
      break;
    case 'yái':
      pinyin = 'yá';
      break;
    case 'ńg，ń':
      pinyin = 'ńg';
      break;
    case 'ňg，ň':
      pinyin = 'ňg';
      break;
    case 'ǹg，ǹ':
      pinyin = 'ǹg';
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
    .replaceAll('ē', 'ē')
    .replaceAll('ê', 'ē')
    .replaceAll('ａ', 'a')
    .replaceAll('ɡ', 'g')
    .replaceAll('ｑ', 'q')
    .replaceAll(/[·]/g, '');
}

/** 修正注音 */
export function correctZhuyin(str) {
  return str.replaceAll('π', 'ㄫ').replaceAll('˙', '');
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

/** 将符号声调拼音转换为数字声调拼音，如 hàn -> han4 */
export function symbolToNumberTonePinyin(pinyin, withoutZeroTone = false) {
  const tone = getPinyinTone(pinyin);

  return zeroPinyinTone(pinyin) + (withoutZeroTone && tone == 0 ? '' : tone);
}

/**
 * 将数字声调拼音转换为符号声调拼音
 *
 * @param {string} pinyin - 拼音字符串，如 "ni3" 或 "lü4"
 * @returns {string} - 带声调符号的拼音，如 "nǐ" 或 "lǜ"
 */
export function numberToSymbolTonePinyin(pinyin) {
  // 声调符号映射表
  const toneMarks = {
    a: { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à' },
    e: { 1: 'ē', 2: 'é', 3: 'ě', 4: 'è' },
    i: { 1: 'ī', 2: 'í', 3: 'ǐ', 4: 'ì' },
    o: { 1: 'ō', 2: 'ó', 3: 'ǒ', 4: 'ò' },
    u: { 1: 'ū', 2: 'ú', 3: 'ǔ', 4: 'ù' },
    ü: { 1: 'ǖ', 2: 'ǘ', 3: 'ǚ', 4: 'ǜ' },
    // n, ng, hng
    n: { 2: 'ń', 3: 'ň', 4: 'ǹ' },
    // m, hm
    m: { 1: 'm̄', 2: 'ḿ', 4: 'm̀' }
  };

  // 在拼音中找出应该标声调的元音索引
  function indexOfMainVowel(py) {
    // 特殊处理 iu 和 ui
    if (py.includes('iu')) {
      return py.lastIndexOf('u');
    } //
    else if (py.includes('ui')) {
      return py.lastIndexOf('i');
    } //
    else if (['ng', 'n', 'hng'].includes(py)) {
      return py.lastIndexOf('n');
    } //
    else if (['hm', 'm'].includes(py)) {
      return py.lastIndexOf('m');
    }

    // 优先级顺序：a > o > e > i > u > ü
    const vowels = ['a', 'o', 'e', 'i', 'u', 'ü'];
    for (let vowel of vowels) {
      const idx = py.indexOf(vowel);

      if (idx !== -1) return idx;
    }
    return -1;
  }

  // 将指定位置的元音替换为带声调符号的字符
  function addToneMark(py, tone, vowelIndex) {
    const vowel = py[vowelIndex];

    const mark = toneMarks[vowel]?.[tone];
    if (!mark) return py;

    return py.slice(0, vowelIndex) + mark + py.slice(vowelIndex + 1);
  }

  // -------------------------------------------------------
  const match = pinyin.match(/(\d+)$/);
  if (!match) return pinyin;

  const tone = parseInt(match[1], 10);
  const pinyinBase = pinyin.slice(0, -match[1].length);

  if (tone === 0) return pinyinBase;

  const vowelIdx = indexOfMainVowel(pinyinBase);
  if (vowelIdx === -1) {
    return pinyinBase;
  }

  return addToneMark(pinyinBase, tone, vowelIdx);
}

// ----------------------------------------------------------------------
// 数字声调拼音 → 唯一整数。不要求可逆，只保证唯一性——
// 利用拼音结构: 声母(24, 含零声母) × 韵母(40) × 声调(5: 0 = 轻声, 1-4 = 1~4 声)
//   id = ((声母下标 × 韵母步长 + 韵母下标) × 5 + 声调槽) < 7680（13 位，uint16 容纳）
// 解析规则: 整字命中韵母表 → 零声母; 否则取最长匹配声母剥离，余部须在韵母表
//   （jue/xue/que/yue 的 ü 按拼写规则写 u → 韵母 ue; 叹词 n/m/ng/hm/hng 为整字韵母）
// 稳定性: 乘法步长 FSTRIDE 为发布常量（非数组长度）——韵母表追加不改变既有下标与步长，
//   故既有 id 不变（总量须 < FSTRIDE = 64，超出需版本升级）;
//   声母表同样只追加（公式不依赖其长度）; 声调 5 为封闭集合。
// 注意: 入参须为规范数字声调拼音（ü 原样，v 需先归一化为 ü），含 v 将抛错。
const INITIALS = [
  '', // 零声母
  'zh', 'ch', 'sh',
  'b', 'p', 'm', 'f', 'd', 't',
  'n', 'l', 'g', 'k', 'h', 'j',
  'q', 'x', 'r', 'z', 'c', 's',
  'y', 'w'
];
const FINALS = [
  'a', 'o', 'e', 'i', 'u', 'ü',
  'ai', 'ei', 'ao', 'ou', 'an',
  'en', 'ang', 'eng', 'er', 'ia',
  'ie', 'iao', 'ian', 'iang', 'iong',
  'in', 'ing', 'ua', 'uo', 'uai',
  'uan', 'uang', 'ui', 'un', 'ong',
  'ue', 'üe', 'ün', 'iu', 'n', 'm',
  'ng', 'hm', 'hng'
];
// 韵母步长: 发布常量（预留余量），韵母表追加不改变既有 id
const FSTRIDE = 64;

/** 拼音 id 值的上限 */
export const PINYIN_ID_UPPER_LIMIT = Math.pow(2, 13);

/** 计算拼音（带符号声调或数字声调）的唯一值，该值对于特定拼音始终是确定值，所以，可直接用于数据库 id */
export function calcPinyinId(pinyin) {
  let tone = 0;
  let plain = pinyin;

  // 带数字声调
  if (/\d$/.test(pinyin)) {
    tone = Number(pinyin.slice(-1));
    plain = pinyin.slice(0, -1);
  }
  // 带符号声调
  else if (!/^[a-zü]+$/.test(pinyin)) {
    tone = getPinyinTone(pinyin);
    plain = zeroPinyinTone(pinyin);
  }

  let i = 0;
  let f = FINALS.indexOf(plain); // 整字韵母（零声母，含叹词）
  if (f === -1) {
    i = INITIALS.findIndex((x) => x && plain.startsWith(x));

    if (i !== -1) {
      f = FINALS.indexOf(plain.slice(INITIALS[i].length));
    }
  }

  if (tone > 4 || i === -1 || f === -1 || f >= FSTRIDE) {
    throw new Error(`无效拼音: ${pinyin}`);
  }

  return (i * FSTRIDE + f) * 5 + tone;
}

// ----------------------------------------------------------------------
