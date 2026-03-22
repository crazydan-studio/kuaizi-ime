import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as events from 'events';
import * as readline from 'readline';

import GraphemeSplitter from 'grapheme-splitter';

import { pinyin as parsePinyin, addDict } from 'pinyin-pro';
// https://pinyin-pro.cn/use/addDict.html
import CompleteDict from '@pinyin-pro/data/complete';

addDict(CompleteDict);

const graphemeSplitter = new GraphemeSplitter();

// https://codingbeautydev.com/blog/javascript-dirname-is-not-defined-in-es-module-scope/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function asyncForEach(array, cb) {
  for (const e of array) {
    await cb(e);
  }
}

/** 当前 node 项目的根目录 */
export function fromRootPath(...paths) {
  return path.join(__dirname, '../..', ...paths);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export function fileSHA256(filepath) {
  // https://gist.github.com/GuillermoPena/9233069#gistcomment-3149231-permalink
  const file = fs.readFileSync(filepath);
  const hash = crypto.createHash('sha256');
  hash.update(file);

  return hash.digest('hex');
}

export function existFile(filepath) {
  return fs.existsSync(filepath);
}

export function copyFile(source, target, override) {
  if (existFile(target) && override !== true) {
    return;
  }

  fs.copyFileSync(source, target);
}

export function readJSONFromFile(filepath, defaultValue = {}) {
  if (!existFile(filepath)) {
    return defaultValue;
  }

  return JSON.parse(readFile(filepath));
}

export function readFile(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

/** @param {String|Buffer} content  */
export function writeFile(filepath, content) {
  assureParentDirCreated(filepath);

  fs.writeFileSync(filepath, content);
}

export function writeJSONToFile(filepath, value) {
  writeFile(filepath, JSON.stringify(value));
}

export async function fetchAndWriteFile(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `HTTP Error: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  writeFile(filepath, buffer);
}

export function readAllFiles(dir) {
  return getAllFiles(dir).map((file) => readFile(file));
}

export function getAllFiles(dir) {
  if (Array.isArray(dir)) {
    return dir.map(getAllFiles).reduce((acc, files) => acc.concat(files), []);
  }

  if (fs.lstatSync(dir).isFile()) {
    return [dir];
  }

  let files = [];
  fs.readdirSync(dir).forEach((file) => {
    const filepath = path.join(dir, file);

    if (fs.lstatSync(filepath).isDirectory()) {
      files = files.concat(getAllFiles(filepath));
    } else {
      files.push(filepath);
    }
  });

  return files;
}

export async function readLineFromFile(filepath, consumer) {
  if (!existFile(filepath)) {
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
  assureParentDirCreated(filepath);

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

export function assureParentDirCreated(filepath) {
  const dirpath = path.dirname(filepath);

  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }
}

export function naiveHTMLNodeInnerText(node) {
  // https://github.com/jsdom/jsdom/issues/1245#issuecomment-1243809196
  // We need Node(DOM's Node) for the constants,
  // but Node doesn't exist in the nodejs global space,
  // and any Node instance references the constants
  // through the prototype chain
  const Node = node;

  return node && node.childNodes
    ? [...node.childNodes]
        .map((node) => {
          switch (node.nodeType) {
            case Node.TEXT_NODE:
              return node.textContent;
            case Node.ELEMENT_NODE:
              return naiveHTMLNodeInnerText(node);
            default:
              return '';
          }
        })
        .join(' ')
    : '';
}

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
