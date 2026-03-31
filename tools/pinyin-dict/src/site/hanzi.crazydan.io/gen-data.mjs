import * as path from 'path';

import {
  fromRootPath,
  getAllFiles,
  writeJSONToFile,
  writeFile,
  existFile,
  readFile
} from '#utils/file.mjs';
import { extractPinyinChars } from '#utils/spell.mjs';
import { getWordUnicode } from '#utils/word.mjs';

import { readAllSavedWordMetas } from '#data/word/meta.mjs';

const siteRootDir = fromRootPath('../../site/hanzi.crazydan.io');

const siteSrcDir = path.join(siteRootDir, 'src');
const siteAssetsDir = path.join(siteRootDir, 'public/assets');
const siteAssetsPinyinDir = path.join(siteAssetsDir, 'pinyin');
const siteAssetsZiDir = path.join(siteAssetsDir, 'zi');
const siteAssetsPinyinAudioDir = path.join(siteAssetsDir, 'audio/pinyin');

// ---------------------------------------------------------------
const ziStructNames = [];
const pinyinValues = [];

console.log();
console.log('读取已收集的有效字信息 ...');
const ziMetas = await readAllSavedWordMetas();

console.log('- 有效字信息总数：' + ziMetas.length);
console.log();

const ziMetaMap = {};
const pinyinZiWeightMap = {};
const ziWeightMap = {};
ziMetas.forEach((meta) => {
  const zi = meta.value;

  meta.pinyins.forEach((py) => {
    if (!pinyinValues.includes(py.value)) {
      pinyinValues.push(py.value);
    }

    const weight = (py.used_weight ||= 0);

    // Note: 多音字的权重累加
    ziWeightMap[zi] ||= 0;
    ziWeightMap[zi] += weight;

    const pyChar = extractPinyinChars(py.value);
    const pyZies = (pinyinZiWeightMap[pyChar] ||= {});
    // Note: 不同声调的多音字的权重累加
    pyZies[zi] ||= 0;
    pyZies[zi] += weight;
  });

  const ziUnicode = getWordUnicode(zi);
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

// ---------------------------------------------------------------
console.log();
console.log('获取拼音音频文件信息 ...');
const pinyinAudios = getAllFiles(siteAssetsPinyinAudioDir);

const audioPinyins = [];
pinyinAudios.forEach((file) => {
  const name = path.basename(file);
  const py = name.replace(/\.mp3$/g, '');
  const pyIdx = pinyinValues.indexOf(py);

  if (pyIdx < 0) {
    console.log(`- 音频 ${name} 对应的拼音 ${py} 未收录`);
  } else {
    audioPinyins.push(pyIdx);
  }
});

console.log('- 已有音频文件总数：' + pinyinAudios.length);
console.log();

// ---------------------------------------------------------------
const pinyinZiSchemaMapping = { value: 0, spell: 1 };

console.log();
console.log('保存拼音字列表 ...');
Object.keys(pinyinZiWeightMap).forEach((pyChar) => {
  const pyZiWeights = pinyinZiWeightMap[pyChar];

  const pyZies = Object.keys(pyZiWeights)
    .sort((z1, z2) => pyZiWeights[z2] - pyZiWeights[z1])
    .map((zi) => {
      // Note: 仅取权重最高的拼音
      const spells = ziMetaMap[zi].spells
        .map((s) => s.value)
        .filter((s) => extractPinyinChars(s) == pyChar);

      const data = [];
      data[pinyinZiSchemaMapping.value] = zi;
      data[pinyinZiSchemaMapping.spell] = pinyinValues.indexOf(spells[0]);

      return data;
    });

  console.log(`- ${pyChar} 包含 ${pyZies.length} 个字`);

  const file = path.join(siteAssetsPinyinDir, `${pyChar}/meta.json`);
  writeJSONToFile(file, { chars: pyZies });
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
  data[pinyinZiSchemaMapping.spell] = pinyinValues.indexOf(spells[0]);

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
      value = value.map((s) => pinyinValues.indexOf(s.value));
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

        value = pinyinValues.indexOf(spells[0]);
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
// 带声调拼音列表
const pinyinValues = ${JSON.stringify(pinyinValues)};
// 有音频的拼音列表，其元素为对应拼音在 pinyinValues 中的序号
const audioPinyins = ${JSON.stringify(audioPinyins)};

export function convertPinyinZiData(data) {
  const obj = convertDataByMapping(data, pinyinZiSchemaMapping);

  obj.spell = pinyinValues[obj.spell];

  return obj;
}

export function convertZiMetaData(data) {
  const obj = convertDataByMapping(data, ziMetaSchemaMapping);

  obj.glyph_type = ziGlyphTypes[obj.glyph_type];
  obj.struct = ziStructNames[obj.struct] || '未知';
  obj.spells = obj.spells.map(s => ({
    value: pinyinValues[s], audio: audioPinyins.includes(s)
  }));

  return obj;
}

export function convertZiGlyphData(data) {
  const obj = convertDataByMapping(data, ziGlyphSchemaMapping);

  obj.glyph_type = ziGlyphTypes[obj.glyph_type];
  obj.spell = pinyinValues[obj.spell];

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
`
);

// ---------------------------------------------------------------
console.log();
