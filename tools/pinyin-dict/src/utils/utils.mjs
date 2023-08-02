import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as events from 'events';
import * as readline from 'readline';

import * as fontkit from 'fontkit';
import getSystemFonts from 'get-system-fonts';
import GraphemeSplitter from 'grapheme-splitter';

const systemFonts = await prepareSystemFonts();
const graphemeSplitter = new GraphemeSplitter();

// https://codingbeautydev.com/blog/javascript-dirname-is-not-defined-in-es-module-scope/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function fromRootPath(...paths) {
  return path.join(__dirname, '../..', ...paths);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export async function readLineFromFile(filepath, consumer) {
  if (!fs.existsSync(filepath)) {
    return [];
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity
  });

  const results = [];
  rl.on('line', (line) => {
    const result = consumer(line);
    if (typeof result !== 'undefined') {
      results.push(result);
    }
  });

  await events.once(rl, 'close');

  return results;
}

export function appendLineToFile(filepath, line, doEmpty) {
  if (!fs.existsSync(filepath) || doEmpty) {
    fs.writeFileSync(filepath, '');
  }

  let fd;
  try {
    fd = fs.openSync(filepath, 'a');
    fs.appendFileSync(fd, line + '\n', 'utf8');
  } finally {
    fd && fs.closeSync(fd);
  }
}

async function prepareSystemFonts() {
  // https://www.npmjs.com/package/get-system-fonts
  const fontFiles = await getSystemFonts();
  const fonts = [];

  // https://github.com/foliojs/fontkit#fonthasglyphforcodepointcodepoint
  fontFiles.forEach((file) => {
    try {
      const font = fontkit.openSync(file);
      if (!font.hasGlyphForCodePoint) {
        return;
      }

      //console.info('Read font file: ' + file);
      fonts.push(font);
    } catch (e) {
      //console.warn('Failed to read font file: ' + file, e);
    }
  });

  return fonts;
}

/** 判断系统字体中是否存在指定编码的字形，若不存在，则表示该编码的字不可读 */
export function hasGlyphFontForCodePoint(unicode) {
  const codePoint = parseInt('0x' + unicode.replaceAll(/^U\+/g, ''), 16);

  for (let i = 0; i < systemFonts.length; i++) {
    const font = systemFonts[i];

    if (font.hasGlyphForCodePoint(codePoint)) {
      return true;
    }
  }
  return false;
}

/** 部分中文和表情符号等占用字节数大于 2，比如: 𫫇，需单独处理 */
export function splitChars(str) {
  // https://github.com/orling/grapheme-splitter
  return graphemeSplitter.splitGraphemes(str);
}

/** 修正拼音 */
export function correctPinyin(str) {
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
    .replaceAll('ē', 'ē');
}

/** 修正注音 */
export function correctZhuyin(str) {
  return str.replaceAll('π', 'ㄫ');
}

/** 拼音去掉声调后的字母组合 */
export function extracePinyinChars(pinyin) {
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
  for (let i = 0; i < pinyin.length; i++) {
    const ch = pinyin.charAt(i);
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

/** 注音去掉声调后的字符组合 */
export function extraceZhuyinChars(zhuyin) {
  return zhuyin.replaceAll(/[ˊˇˋˉ˙]/g, '');
}
