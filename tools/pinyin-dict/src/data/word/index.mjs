import { fromRootPath } from '#utils/utils.mjs';

import pinyinData from '#data/provider/pinyin-data.mjs';
import opencc from '#data/provider/opencc.mjs';
import wanxiang from '#data/provider/wanxiang.mjs';

import {
  patchMetaAndSaveToFile,
  saveWordMetasToFile,
  calculateWordWeightByGlyph,
  patchWordPinyinWeight
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
const wordMetas = await patchMetaAndSaveToFile(zdicWords, wordDataRawFile);
wordMetas.forEach((meta) => {
  meta.traditional = !!tradWords[meta.value];
});

const hasPinyin = (w) => Object.keys(w.pinyins).length > 0;
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
console.log('- 有拼音字数：' + wordMetasWithPinyin.length);
console.log('- 无拼音字数：' + wordMetasWithoutPinyin.length);
console.log('- 有字形字数：' + wordMetasWithGlyph.length);
console.log('- 无字形字数：' + wordMetasWithoutGlyph.length);
console.log('- 有笔顺字数：' + wordMetasWithStrokeOrder.length);
console.log('- 无笔顺字数：' + wordMetasWithoutStrokeOrder.length);
console.log('- 短语数：' + wordMetas.reduce((r, w) => r + w.phrases.length, 0));
console.log();
console.log(
  '- 无拼音字列表：' +
    wordMetasWithoutPinyin.map((meta) => meta.value).join(', ')
);
console.log(
  '- 无拼音无笔顺无字形字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => !w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音有笔顺无字形字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音无笔顺有字形字列表：' +
    wordMetasWithoutPinyin
      .filter((w) => !w.stroke_order && w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);

console.log(
  '- 有字形无笔顺字列表：' +
    wordMetasWithGlyph
      .filter((w) => !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无拼音字列表：' +
    wordMetasWithGlyph
      .filter(hasNotPinyin)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无拼音无笔顺字列表：' +
    wordMetasWithGlyph
      .filter((w) => hasNotPinyin(w) && !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
// console.log(
//   '- 有字形字列表：' + wordMetasWithGlyph.map((meta) => meta.value).join(', ')
// );

// console.log(
//   '- 无字形有拼音字列表：' +
//     wordMetasWithoutGlyph
//       .filter(hasPinyin)
//       .map((meta) => `${meta.value}(${meta.unicode})`)
//       .join(', ')
// );
// console.log(
//   '- 无字形有笔顺字列表：' +
//     wordMetasWithoutGlyph
//       .filter((w) => w.stroke_order)
//       .map((meta) => `${meta.value}(${meta.unicode})`)
//       .join(', ')
// );
// console.log(
//   '- 无字形有拼音有笔顺字列表：' +
//     wordMetasWithoutGlyph
//       .filter((w) => hasPinyin(w) && w.stroke_order)
//       .map((meta) => `${meta.value}(${meta.unicode})`)
//       .join(', ')
// );
// console.log(
//   '- 无字形字列表：' +
//     wordMetasWithoutGlyph.map((meta) => meta.value).join(', ')
// );
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('按字形计算字的权重 ...');
calculateWordWeightByGlyph(wordMetasWithGlyph);
console.log();

console.log();
console.log('按读音为字补充使用权重 ...');
const wordPinyinWeightData = await wanxiang.readZiData();

patchWordPinyinWeight(wordMetasWithGlyph, wordPinyinWeightData);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('保存有字形的字数据 ...');
saveWordMetasToFile(wordMetasWithGlyph, wordDataValidFile);

console.log('有字形的字数据已保存至：' + wordDataValidFile);
console.log();
