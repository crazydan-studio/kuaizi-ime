import { fromRootPath } from '#utils/utils.mjs';

import * as pinyinData from '#data/provider/pinyin-data.mjs';
import * as opencc from '#data/provider/opencc.mjs';
import * as wanxiang from '#data/provider/wanxiang.mjs';

import {
  patchWordMetaAndSaveToFile,
  saveWordMetasToFile,
  calculateWordGlyphWeight,
  patchWordPinyinUsedWeight
} from './meta.mjs';

// 采用 [汉典网](http://zdic.net/) 的单字数据、万象拼音的字词权重数据、OpenCC 的繁简转换数据
// Note: OpenCC 中的繁简信息比万象拼音的更全面、更准确

// 包含完整拼音和字信息的文本文件
const wordDataRawFile = fromRootPath('data', 'pinyin-dict.raw.txt');
const wordDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');

// -----------------------------------------------------------------------
console.log();
console.log('读取 OpenCC 数据 ...');
const tradWords = await opencc.readTrad2SimpChars();
const simpWords = await opencc.readSimp2TradChars();

console.log('已读取 OpenCC 数据：');
console.log('- 繁体字数：' + Object.keys(tradWords).length);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('读取 pinyin-data 数据 ...');
const zdicWords = await pinyinData.readZdicWords();
const zdicWordKeys = Object.keys(zdicWords);

console.log('已读取 pinyin-data 数据：');
console.log('- 总字数：' + zdicWordKeys.length);
console.log('- 繁体字数：' + zdicWordKeys.filter((w) => !!tradWords[w]).length);
console.log('- 简体字数：' + zdicWordKeys.filter((w) => !tradWords[w]).length);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('读取 zdic.net 数据 ...');
const wordMetas = await patchWordMetaAndSaveToFile(zdicWords, wordDataRawFile);
wordMetas.forEach((meta) => {
  const simps = tradWords[meta.value] || [];
  const trads = simpWords[meta.value] || [];

  meta.traditional = simps.length > 0;
  meta.simple_words = simps;
  meta.traditional_words = trads;
});

const hasPinyin = (w) => w.pinyins.length > 0;
const hasNotPinyin = (w) => !hasPinyin(w);
const wordMetasWithPinyin = wordMetas.filter(hasPinyin);
const wordMetasWithoutPinyin = wordMetas.filter(hasNotPinyin);
const wordMetasWithGlyph = wordMetas.filter((w) => w.glyph_font_exists);
const wordMetasWithoutGlyph = wordMetas.filter((w) => !w.glyph_font_exists);
const wordMetasWithStrokeOrder = wordMetas.filter((w) => !!w.stroke_order);
const wordMetasWithoutStrokeOrder = wordMetas.filter((w) => !w.stroke_order);

console.log('已读取 zdic.net 数据：');
console.log('- 总字数：' + wordMetas.length);
console.log('- 繁体字数：' + wordMetas.filter((w) => w.traditional).length);
console.log('- 简体字数：' + wordMetas.filter((w) => !w.traditional).length);
console.log();
console.log('- 有拼音字数：' + wordMetasWithPinyin.length);
console.log('- 有字形字数：' + wordMetasWithGlyph.length);
console.log('- 有笔顺字数：' + wordMetasWithStrokeOrder.length);
console.log();
console.log('- 无拼音字数：' + wordMetasWithoutPinyin.length);
console.log('- 无字形字数：' + wordMetasWithoutGlyph.length);
console.log('- 无笔顺字数：' + wordMetasWithoutStrokeOrder.length);
console.log();
console.log(
  '- 无拼音的字列表：' +
    wordMetasWithoutPinyin.map((meta) => meta.value).join(', ')
);
console.log(
  '- 无拼音无笔顺无字形的字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => !w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音有笔顺无字形的字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音无笔顺有字形的字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => !w.stroke_order && w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);

console.log();
console.log(
  '- 有字形无笔顺的字列表：' +
    wordMetasWithGlyph
      .filter((w) => !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无结构的字列表：' +
    wordMetasWithGlyph
      .filter((w) => !w.glyph_struct)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无部首的字列表：' +
    wordMetasWithGlyph
      .filter((w) => !w.radical)
      .map((meta) => meta.value)
      .join(', ')
);
console.log();
console.log(
  '- 有字形无拼音的字列表：' +
    wordMetasWithGlyph
      .filter(hasNotPinyin)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无拼音无笔顺的字列表：' +
    wordMetasWithGlyph
      .filter((w) => hasNotPinyin(w) && !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log();
console.log(
  '- 有字形的结构列表：' +
    Object.keys(
      wordMetasWithGlyph.reduce((r, w) => {
        r[w.glyph_struct || '未知'] = true;
        return r;
      }, {})
    ).join(', ')
);
console.log(
  '- 有字形的部首列表：' +
    Object.keys(
      wordMetasWithGlyph.reduce((r, w) => {
        r[w.radical || '未知'] = true;
        return r;
      }, {})
    ).join(', ')
);

// -----------------------------------------------------------------------
console.log();
console.log('按字形计算字的权重 ...');
calculateWordGlyphWeight(wordMetasWithGlyph);
console.log();

console.log();
console.log('按拼音为字补充使用权重 ...');
const wordPinyinWeightData = await wanxiang.readZiData();

patchWordPinyinUsedWeight(wordMetasWithGlyph, wordPinyinWeightData);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('保存有字形的字数据 ...');
saveWordMetasToFile(wordMetasWithGlyph, wordDataValidFile);

console.log('有字形的字数据已保存至：' + wordDataValidFile);
console.log();
