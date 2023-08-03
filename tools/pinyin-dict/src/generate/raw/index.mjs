import { fromRootPath } from '../../utils/utils.mjs';
import {
  readZDicWordsFromPinyinData,
  readTraditionalWordsFromOpenCC,
  patchAndSaveZDicWordsToFile,
  saveWordMetasToFile,
  calculateWordWeightByGlyph
} from './raw.mjs';

// 采用 汉典网(http://zdic.net/) 的数据
// https://github.com/mozillazg/pinyin-data/blob/master/zdic.txt
const pinyinDataFile = fromRootPath('../..', 'data/pinyin-data/zdic.txt');
// 繁->简 转换数据，用于确定繁体字
// https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSCharacters.txt
const tradToSimpleDataFile = fromRootPath(
  '../..',
  'data/OpenCC/data/dictionary/TSCharacters.txt'
);

// 包含完整拼音和字信息的文本文件
const dictDataRawFile = fromRootPath('data', 'pinyin-dict.raw.txt');
const dictDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');

console.log();
console.log('读取 OpenCC 数据 ...');
const traditionalWords = await readTraditionalWordsFromOpenCC(
  tradToSimpleDataFile
);
console.log('已读取 OpenCC 数据：');
console.log('- 繁体字数：' + Object.keys(traditionalWords).length);
console.log();

console.log();
console.log('读取 pinyin-data 数据 ...');
const zdicWords = await readZDicWordsFromPinyinData(pinyinDataFile);
zdicWords.forEach((word) => {
  word.traditional = !!traditionalWords[word.value];
});
console.log('已读取 pinyin-data 数据：');
console.log('- 总字数：' + zdicWords.length);
console.log('- 繁体字数：' + zdicWords.filter((w) => w.traditional).length);
console.log('- 简体字数：' + zdicWords.filter((w) => !w.traditional).length);
console.log();

console.log();
console.log('读取 zdic.net 数据 ...');
const wordMetas = await patchAndSaveZDicWordsToFile(dictDataRawFile, zdicWords);
const wordMetasWithPinyin = wordMetas.filter((w) => w.pinyins.length > 0);
const wordMetasWithoutPinyin = wordMetas.filter((w) => w.pinyins.length === 0);
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
      .filter((w) => w.pinyins.length === 0)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无拼音无笔顺字列表：' +
    wordMetasWithGlyph
      .filter((w) => w.pinyins.length === 0 && !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形字列表：' + wordMetasWithGlyph.map((meta) => meta.value).join(', ')
);

console.log(
  '- 无字形有拼音字列表：' +
    wordMetasWithoutGlyph
      .filter((w) => w.pinyins.length !== 0)
      .map((meta) => `${meta.value}(${meta.unicode})`)
      .join(', ')
);
console.log(
  '- 无字形有笔顺字列表：' +
    wordMetasWithoutGlyph
      .filter((w) => w.stroke_order)
      .map((meta) => `${meta.value}(${meta.unicode})`)
      .join(', ')
);
console.log(
  '- 无字形有拼音有笔顺字列表：' +
    wordMetasWithoutGlyph
      .filter((w) => w.pinyins.length !== 0 && w.stroke_order)
      .map((meta) => `${meta.value}(${meta.unicode})`)
      .join(', ')
);
// console.log(
//   '- 无字形字列表：' +
//     wordMetasWithoutGlyph.map((meta) => meta.value).join(', ')
// );
console.log();

console.log();
console.log('保存有字形的字数据 ...');
calculateWordWeightByGlyph(wordMetasWithGlyph);

saveWordMetasToFile(dictDataValidFile, wordMetasWithGlyph);
console.log('有字形的字数据已保存至：' + dictDataValidFile);
console.log();
