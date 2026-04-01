import { fromRootPath } from '#utils/file.mjs';

import * as pinyinData from '#data/provider/pinyin-data.mjs';
import * as opencc from '#data/provider/opencc.mjs';
import * as wanxiang from '#data/provider/wanxiang.mjs';

import {
  getZiMetasSavedFile,
  patchZiMetaAndSaveToFile,
  saveZiMetasToFile,
  calculateZiGlyphWeight,
  patchPinyinZiUsedWeight
} from './meta.mjs';

// 采用 [汉典网](http://zdic.net/) 的单字数据、万象拼音的字词权重数据、OpenCC 的繁简转换数据
// Note: OpenCC 中的繁简信息比万象拼音的更全面、更准确

// 包含完整拼音和字信息的文本文件
const ziDataRawFile = fromRootPath('data', 'pinyin-dict.raw.txt');
const ziDataValidFile = getZiMetasSavedFile();

// -----------------------------------------------------------------------
console.log();
console.log('读取 OpenCC 数据 ...');
const tradZies = await opencc.readTrad2SimpChars();
const simpZies = await opencc.readSimp2TradChars();

console.log('已读取 OpenCC 数据：');
console.log('- 繁体字数：' + Object.keys(tradZies).length);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('读取 pinyin-data 数据 ...');
const zdicZies = await pinyinData.readZdicData();
const zdicZiKeys = Object.keys(zdicZies);

console.log('已读取 pinyin-data 数据：');
console.log('- 总字数：' + zdicZiKeys.length);
console.log('- 繁体字数：' + zdicZiKeys.filter((w) => !!tradZies[w]).length);
console.log('- 简体字数：' + zdicZiKeys.filter((w) => !tradZies[w]).length);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('读取 zdic.net 数据 ...');
const ziMetas = await patchZiMetaAndSaveToFile(zdicZies, ziDataRawFile);
ziMetas.forEach((meta) => {
  const simps = tradZies[meta.value] || [];
  const trads = simpZies[meta.value] || [];

  meta.traditional = simps.length > 0;
  meta.simples = simps;
  meta.traditionals = trads;
});

const withPinyin = (w) => w.pinyins.length > 0;
const withoutPinyin = (w) => !withPinyin(w);
const ziMetasWithPinyin = ziMetas.filter(withPinyin);
const ziMetasWithoutPinyin = ziMetas.filter(withoutPinyin);
const ziMetasWithGlyph = ziMetas.filter((w) => w.glyph_font_exists);
const ziMetasWithoutGlyph = ziMetas.filter((w) => !w.glyph_font_exists);
const ziMetasWithStrokeOrder = ziMetas.filter((w) => !!w.stroke_order);
const ziMetasWithoutStrokeOrder = ziMetas.filter((w) => !w.stroke_order);

console.log('已读取 zdic.net 数据：');
console.log('- 总字数：' + ziMetas.length);
console.log('- 繁体字数：' + ziMetas.filter((w) => w.traditional).length);
console.log('- 简体字数：' + ziMetas.filter((w) => !w.traditional).length);
console.log();
console.log('- 有拼音字数：' + ziMetasWithPinyin.length);
console.log('- 有字形字数：' + ziMetasWithGlyph.length);
console.log('- 有笔顺字数：' + ziMetasWithStrokeOrder.length);
console.log();
console.log('- 无拼音字数：' + ziMetasWithoutPinyin.length);
console.log('- 无字形字数：' + ziMetasWithoutGlyph.length);
console.log('- 无笔顺字数：' + ziMetasWithoutStrokeOrder.length);
console.log();
console.log(
  '- 无拼音的字列表：' +
    ziMetasWithoutPinyin.map((meta) => meta.value).join(', ')
);
console.log(
  '- 无拼音无笔顺无字形的字列表：' +
    ziMetasWithoutPinyin
      .filter((w) => !w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音有笔顺无字形的字列表：' +
    ziMetasWithoutPinyin
      .filter((w) => w.stroke_order && !w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 无拼音无笔顺有字形的字列表：' +
    ziMetasWithoutPinyin
      .filter((w) => !w.stroke_order && w.glyph_font_exists)
      .map((meta) => meta.value)
      .join(', ')
);

console.log();
console.log(
  '- 有字形无笔顺的字列表：' +
    ziMetasWithGlyph
      .filter((w) => !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无结构的字列表：' +
    ziMetasWithGlyph
      .filter((w) => !w.glyph_struct)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无部首的字列表：' +
    ziMetasWithGlyph
      .filter((w) => !w.radical)
      .map((meta) => meta.value)
      .join(', ')
);
console.log();
console.log(
  '- 有字形无拼音的字列表：' +
    ziMetasWithGlyph
      .filter(withoutPinyin)
      .map((meta) => meta.value)
      .join(', ')
);
console.log(
  '- 有字形无拼音无笔顺的字列表：' +
    ziMetasWithGlyph
      .filter((w) => withoutPinyin(w) && !w.stroke_order)
      .map((meta) => meta.value)
      .join(', ')
);
console.log();
console.log(
  '- 有字形的结构列表：' +
    Object.keys(
      ziMetasWithGlyph.reduce((r, w) => {
        r[w.glyph_struct || '未知'] = true;
        return r;
      }, {})
    ).join(', ')
);
console.log(
  '- 有字形的部首列表：' +
    Object.keys(
      ziMetasWithGlyph.reduce((r, w) => {
        r[w.radical || '未知'] = true;
        return r;
      }, {})
    ).join(', ')
);

// -----------------------------------------------------------------------
console.log();
console.log('按字形计算字的权重 ...');
calculateZiGlyphWeight(ziMetasWithGlyph);
console.log();

console.log();
console.log('按拼音为字补充使用权重 ...');
const pinyinZiWeightData = await wanxiang.readZiData();

patchPinyinZiUsedWeight(ziMetasWithGlyph, pinyinZiWeightData);
console.log();

// -----------------------------------------------------------------------
console.log();
console.log('保存有字形的字数据 ...');
saveZiMetasToFile(ziMetasWithGlyph, ziDataValidFile);

console.log('有字形的字数据已保存至：' + ziDataValidFile);
console.log();
