import * as path from 'path';

import {
  fromRootPath,
  getAllFiles,
  writeJSONToFile,
  writeFile,
  existFile,
  readFile
} from '#utils/file.mjs';
import { symbolToNumberTonePinyin, zeroPinyinTone } from '#utils/spell.mjs';
import { getZiUnicode } from '#utils/zi.mjs';

import { readAllSavedZiMetas } from '#data/zi/meta.mjs';

const siteRootDir = fromRootPath('../../site/hanzi.crazydan.io');

const siteSrcDir = path.join(siteRootDir, 'src');
const siteAssetsDir = path.join(siteRootDir, 'public/assets');
const siteAssetsPinyinDir = path.join(siteAssetsDir, 'pinyin');
const siteAssetsZiDir = path.join(siteAssetsDir, 'zi');
const siteAssetsPinyinAudioDir = path.join(siteAssetsDir, 'audio/pinyin');

// ---------------------------------------------------------------
const ziStructNames = [];
const numberAndSymbolTonePinyinMap = {};

console.log();
console.log('读取已收集的有效字信息 ...');
const ziMetas = await readAllSavedZiMetas();

console.log('- 有效字信息总数：' + ziMetas.length);
console.log();

const ziMetaMap = {};
const pinyinZiWeightMap = {};
const ziWeightMap = {};
ziMetas.forEach((meta) => {
  const zi = meta.value;

  meta.pinyins.forEach((py) => {
    const numberTonePinyin = symbolToNumberTonePinyin(py.value, true);
    if (!numberAndSymbolTonePinyinMap[numberTonePinyin]) {
      numberAndSymbolTonePinyinMap[numberTonePinyin] = py.value;
    }

    const weight = (py.used_weight ||= 0);

    // Note: 多音字的权重累加
    ziWeightMap[zi] ||= 0;
    ziWeightMap[zi] += weight;

    const pinyin = zeroPinyinTone(py.value);
    const zies = (pinyinZiWeightMap[pinyin] ||= {});
    // Note: 不同声调的多音字的权重累加
    zies[zi] ||= 0;
    zies[zi] += weight;
  });

  const ziUnicode = getZiUnicode(zi);
  if (ziUnicode != meta.unicode) {
    console.log(
      `- ${zi} 的 Unicode 与计算结果不一致：${meta.unicode} != ${ziUnicode}`
    );
  }

  const glyph_struct = (meta.glyph_struct || '').replace(/结构$/g, '');
  if (!!glyph_struct && !ziStructNames.includes(glyph_struct)) {
    ziStructNames.push(glyph_struct);
  }

  ziMetaMap[zi] = {
    value: zi,
    unicode: meta.unicode,
    spells: meta.pinyins.sort((p1, p2) => p2.used_weight - p1.used_weight),
    radical: meta.radical,
    stroke_count: meta.total_stroke_count,
    struct: glyph_struct,
    glyph_weight: meta.glyph_weight || 0
  };
});

// 保证拼音的顺序不变
const numberTonePinyins = Object.keys(numberAndSymbolTonePinyinMap).sort();
const symbolTonePinyins = numberTonePinyins.map(
  (py) => numberAndSymbolTonePinyinMap[py]
);

// ---------------------------------------------------------------
console.log();
console.log('获取拼音音频文件信息 ...');
const pinyinAudios = getAllFiles(siteAssetsPinyinAudioDir);

const pinyinAudioNames = [];
pinyinAudios.forEach((file) => {
  const name = path.basename(file);

  const pinyin = name.replace(/\.mp3$/g, '');
  const pinyinIdx = numberTonePinyins.indexOf(pinyin);

  if (pinyinIdx < 0) {
    console.log(`- 音频 ${name} 对应的拼音 ${pinyin} 未收录`);
  } else {
    pinyinAudioNames[pinyinIdx] = pinyin;
  }
});

console.log('- 已有音频文件总数：' + pinyinAudios.length);
console.log();

// ---------------------------------------------------------------
const pinyinZiSchemaMapping = { value: 0, spell: 1 };

console.log();
console.log('保存拼音字列表 ...');
Object.keys(pinyinZiWeightMap).forEach((pinyin) => {
  const ziWeights = pinyinZiWeightMap[pinyin];

  const zies = Object.keys(ziWeights)
    .sort((z1, z2) => ziWeights[z2] - ziWeights[z1])
    .map((zi) => {
      // Note: 仅取权重最高的拼音
      const spells = ziMetaMap[zi].spells
        .map((s) => s.value)
        .filter((s) => zeroPinyinTone(s) == pinyin);

      const data = [];
      data[pinyinZiSchemaMapping.value] = zi;
      data[pinyinZiSchemaMapping.spell] = symbolTonePinyins.indexOf(spells[0]);

      return data;
    });

  console.log(`- ${pinyin} 包含 ${zies.length} 个字`);

  const file = path.join(siteAssetsPinyinDir, `${pinyin}/meta.json`);
  writeJSONToFile(file, { zies });
});

// ---------------------------------------------------------------
const sortedZiesByWeight = Object.keys(ziWeightMap).sort(
  (z1, z2) => ziWeightMap[z2] - ziWeightMap[z1]
);

console.log();
console.log('保存常用字列表 ...');
const commonZies = sortedZiesByWeight.slice(0, 3500).map((zi) => {
  // Note: 仅取权重最高的拼音
  const spells = ziMetaMap[zi].spells.map((s) => s.value);

  const data = [];
  data[pinyinZiSchemaMapping.value] = zi;
  data[pinyinZiSchemaMapping.spell] = symbolTonePinyins.indexOf(spells[0]);

  return data;
});
writeJSONToFile(path.join(siteAssetsZiDir, 'commons.json'), commonZies);

// ---------------------------------------------------------------
const ziMetaSchemaMapping = {
  value: 0,
  spells: 1,
  radical: 2,
  stroke_count: 3,
  struct: 4,
  glyph_type: 5
};
const ziGlyphTypes = ['stroke', 'glyph'];

console.log();
console.log('保存单字详细信息 ...');
Object.keys(ziMetaMap).forEach((zi) => {
  const meta = ziMetaMap[zi];
  const unicode = meta.unicode;

  const glyphSvgFile = path.join(siteAssetsZiDir, `${unicode}/glyph.svg`);
  const strokeSvgFile = path.join(siteAssetsZiDir, `${unicode}/stroke.svg`);

  if (existFile(strokeSvgFile)) {
    // Note: 笔画 svg 图像由 shell 脚本生成
    meta.glyph_type = 'stroke';

    const svg = readFile(strokeSvgFile);
    if (svg) {
      const strokeCount = (svg.match(/<g\s+id="s-\d+"/g) || []).length;
      if (strokeCount != meta.stroke_count) {
        console.log(
          `- ${zi}(${unicode}) 的笔画图像包含 ${strokeCount} 个笔画，但其数据中记录的笔画数为 ${meta.stroke_count}`
        );
      }

      // Note: 笔画数始终与笔画动画中的笔画数保持一致
      meta.stroke_count = strokeCount;
    }
  }

  if (existFile(glyphSvgFile)) {
    if (!meta.glyph_type) {
      meta.glyph_type = 'glyph';
    }
  }

  if (!meta.glyph_type) {
    console.log(`- ${zi} 没有字形和笔画动画图像文件`);
  }

  const data = [];
  Object.keys(ziMetaSchemaMapping).forEach((prop) => {
    const index = ziMetaSchemaMapping[prop];

    let value = meta[prop];
    if (prop == 'spells') {
      value = value.map((s) => symbolTonePinyins.indexOf(s.value));
    } else if (prop == 'struct') {
      value = ziStructNames.indexOf(value);
    } else if (prop == 'glyph_type') {
      value = ziGlyphTypes.indexOf(value);
    }

    if (value == undefined) {
      value = '';
    }
    data[index] = value;
  });

  const file = path.join(siteAssetsZiDir, `${unicode}/meta.json`);
  writeJSONToFile(file, data);
});

// ---------------------------------------------------------------
const ziGlyphSchemaMapping = { value: 0, glyph_type: 1, spell: 2 };

console.log();
console.log('保存汉字笔画信息 ...');
const ziGlyphData = Object.keys(ziMetaMap)
  .sort((z1, z2) => ziMetaMap[z1].glyph_weight - ziMetaMap[z2].glyph_weight)
  .map((zi) => {
    const meta = ziMetaMap[zi];

    const data = [];
    Object.keys(ziGlyphSchemaMapping).forEach((prop) => {
      const index = ziGlyphSchemaMapping[prop];

      let value = meta[prop];
      if (prop == 'glyph_type') {
        value = ziGlyphTypes.indexOf(value);
      } else if (prop == 'spell') {
        // Note: 仅取权重最高的拼音
        const spells = meta.spells.map((s) => s.value);

        value = symbolTonePinyins.indexOf(spells[0]);
      }

      data[index] = value;
    });

    return data;
  });
writeJSONToFile(path.join(siteAssetsZiDir, 'glyphs.json'), ziGlyphData);

// ---------------------------------------------------------------
console.log();
console.log('更新数据 schema 定义 ...');

// Note: 采用数组存放数据，从而尽可能降低数据文件的总体大小
writeFile(
  path.join(siteSrcDir, 'data/schema.js'),
  `/** 统一将模型的数组数据转换为对象结构 */

// 拼音字信息的结构
const pinyinZiSchemaMapping = ${JSON.stringify(pinyinZiSchemaMapping)};
// 汉字信息的结构
const ziMetaSchemaMapping = ${JSON.stringify(ziMetaSchemaMapping)};
// 汉字字形图像类型：笔画分解 or 纯字形
const ziGlyphTypes = ${JSON.stringify(ziGlyphTypes)};
// 汉字字形信息结构
const ziGlyphSchemaMapping = ${JSON.stringify(ziGlyphSchemaMapping)};

// 汉字结构名列表
const ziStructNames = ${JSON.stringify(ziStructNames)};

export function convertPinyinZiData(data) {
  const obj = convertDataByMapping(data, pinyinZiSchemaMapping);

  obj.spell = symbolTonePinyins[obj.spell];

  return obj;
}

export function convertZiMetaData(data) {
  const obj = convertDataByMapping(data, ziMetaSchemaMapping);

  obj.glyph_type = ziGlyphTypes[obj.glyph_type];
  obj.struct = ziStructNames[obj.struct] || '未知';
  obj.spells = obj.spells.map(s => ({
    value: symbolTonePinyins[s], audio_name: pinyinAudioNames[s]
  }));

  return obj;
}

export function convertZiGlyphData(data) {
  const obj = convertDataByMapping(data, ziGlyphSchemaMapping);

  obj.glyph_type = ziGlyphTypes[obj.glyph_type];
  obj.spell = symbolTonePinyins[obj.spell];

  return obj;
}

function convertDataByMapping(data, mapping) {
  const obj = {};

  if (data && data.length > 0) {
    Object.keys(mapping).forEach((prop) => {
      const index = mapping[prop];
      obj[prop] = data[index];
    });
  }
  return obj;
}

// 拼音列表
const symbolTonePinyins = ${JSON.stringify(symbolTonePinyins)};
// 拼音音频文件名列表，其元素位置与 symbolTonePinyins 一一对应，若拼音音频不存在，则该位置为空
const pinyinAudioNames = ${JSON.stringify(pinyinAudioNames).replace(/(null)/g, '')};
`
);

// ---------------------------------------------------------------
console.log();
