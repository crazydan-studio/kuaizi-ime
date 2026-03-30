import * as path from 'path';

import {
  fromRootPath,
  getAllFiles,
  copyFile,
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

const pinyinAudiosDir = fromRootPath('data', 'medias/pinyin');
const ziMediasDir = fromRootPath('data', 'medias/zi');

// ---------------------------------------------------------------
const wordStructNames = [];
const pinyinValues = [];

console.log();
console.log('读取已收集的有效字信息 ...');
const wordMetas = await readAllSavedWordMetas();

console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

const wordMetaMap = {};
const pinyinWordWeightMap = {};
const wordWeightMap = {};
wordMetas.forEach((meta) => {
  const word = meta.value;

  meta.pinyins.forEach((py) => {
    if (!pinyinValues.includes(py.value)) {
      pinyinValues.push(py.value);
    }

    const weight = (py.used_weight ||= 0);

    // Note: 多音字的权重累加
    wordWeightMap[word] ||= 0;
    wordWeightMap[word] += weight;

    const pyChar = extractPinyinChars(py.value);
    const pyWords = (pinyinWordWeightMap[pyChar] ||= {});
    // Note: 不同声调的多音字的权重累加
    pyWords[word] ||= 0;
    pyWords[word] += weight;
  });

  const wordUnicode = getWordUnicode(word);
  if (wordUnicode != meta.unicode) {
    console.log(
      `- ${word} 的 Unicode 与计算结果不一致：${meta.unicode} != ${wordUnicode}`
    );
  }

  const glyph_struct = (meta.glyph_struct || '').replace(/结构$/g, '');
  if (!!glyph_struct && !wordStructNames.includes(glyph_struct)) {
    wordStructNames.push(glyph_struct);
  }

  wordMetaMap[word] = {
    value: word,
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
console.log('复制拼音音频文件到目标站点 ...');
const pinyinAudios = getAllFiles(pinyinAudiosDir);

const audioPinyins = [];
pinyinAudios.forEach((file) => {
  const name = path.basename(file);
  const py = name.replace(/\.mp3$/g, '');
  const pyIdx = pinyinValues.indexOf(py);

  if (pyIdx < 0) {
    console.log(`- 音频 ${name} 对应的拼音 ${py} 未收录`);
  } else {
    audioPinyins.push(pyIdx);

    const target = path.join(siteAssetsDir, `audio/pinyin/${name}`);
    copyFile(file, target, false);
  }
});

console.log('- 已复制音频文件总数：' + pinyinAudios.length);
console.log();

// ---------------------------------------------------------------
const pinyinWordSchemaMapping = { value: 0, spell: 1 };

console.log();
console.log('保存拼音字列表 ...');
Object.keys(pinyinWordWeightMap).forEach((pyChar) => {
  const pyWordWeights = pinyinWordWeightMap[pyChar];

  const pyWords = Object.keys(pyWordWeights)
    .sort((w1, w2) => pyWordWeights[w2] - pyWordWeights[w1])
    .map((w) => {
      // Note: 仅取权重最高的拼音
      const spells = wordMetaMap[w].spells
        .map((s) => s.value)
        .filter((s) => extractPinyinChars(s) == pyChar);

      const data = [];
      data[pinyinWordSchemaMapping.value] = w;
      data[pinyinWordSchemaMapping.spell] = pinyinValues.indexOf(spells[0]);

      return data;
    });

  console.log(`- ${pyChar} 包含 ${pyWords.length} 个字`);
  // if (pyChar == 'zhong') {
  //   console.log(`- ${pyChar}: `, pyWords.map(w=>`${w.v}-${pyWordWeights[w.v]}`).join(', '));
  // }

  const file = path.join(siteAssetsPinyinDir, `${pyChar}/meta.json`);
  writeJSONToFile(file, { chars: pyWords });
});

// ---------------------------------------------------------------
const sortedWordsByWeight = Object.keys(wordWeightMap).sort(
  (w1, w2) => wordWeightMap[w2] - wordWeightMap[w1]
);

console.log();
console.log('保存常用字列表 ...');
const commonWords = sortedWordsByWeight.slice(0, 3500).map((w) => {
  // Note: 仅取权重最高的拼音
  const spells = wordMetaMap[w].spells.map((s) => s.value);

  const data = [];
  data[pinyinWordSchemaMapping.value] = w;
  data[pinyinWordSchemaMapping.spell] = pinyinValues.indexOf(spells[0]);

  return data;
});
writeJSONToFile(path.join(siteAssetsZiDir, 'commons.json'), commonWords);

// ---------------------------------------------------------------
const wordMetaSchemaMapping = {
  value: 0,
  spells: 1,
  radical: 2,
  stroke_count: 3,
  struct: 4,
  glyph_type: 5
};
const wordGlyphTypes = ['stroke', 'glyph'];

console.log();
console.log('保存单字详细信息 ...');
Object.keys(wordMetaMap).forEach((word) => {
  const meta = wordMetaMap[word];
  const unicode = meta.unicode;

  const glyphSvgFile = path.join(ziMediasDir, `${unicode}/glyph.svg`);
  const strokeDemoFile = path.join(ziMediasDir, `${unicode}/stroke-demo.gif`);

  if (existFile(strokeDemoFile)) {
    // Note: 笔画 svg 图像由 shell 脚本生成
    meta.glyph_type = 'stroke';

    const target = path.join(siteAssetsZiDir, `${unicode}/stroke.svg`);
    const svg = readFile(target);
    if (svg) {
      const strokeCount = (svg.match(/<g\s+id="s-\d+"/g) || []).length;
      if (strokeCount != meta.stroke_count) {
        console.log(
          `- ${word}(${unicode}) 的笔画图像包含 ${strokeCount} 个笔画，但其数据中记录的笔画数为 ${meta.stroke_count}`
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

    const target = path.join(siteAssetsZiDir, `${unicode}/glyph.svg`);
    copyFile(glyphSvgFile, target, false);
  }

  if (!meta.glyph_type) {
    console.log(`- ${word} 没有字形和笔画动画图像文件`);
  }

  const data = [];
  Object.keys(wordMetaSchemaMapping).forEach((prop) => {
    const index = wordMetaSchemaMapping[prop];

    let value = meta[prop];
    if (prop == 'spells') {
      value = value.map((s) => pinyinValues.indexOf(s.value));
    } else if (prop == 'struct') {
      value = wordStructNames.indexOf(value);
    } else if (prop == 'glyph_type') {
      value = wordGlyphTypes.indexOf(value);
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
const wordGlyphSchemaMapping = { value: 0, glyph_type: 1, spell: 2 };

console.log();
console.log('保存汉字笔画信息 ...');
const wordGlyphData = Object.keys(wordMetaMap)
  .sort(
    (w1, w2) => wordMetaMap[w1].glyph_weight - wordMetaMap[w2].glyph_weight
  )
  .map((word) => {
    const meta = wordMetaMap[word];

    const data = [];
    Object.keys(wordGlyphSchemaMapping).forEach((prop) => {
      const index = wordGlyphSchemaMapping[prop];

      let value = meta[prop];
      if (prop == 'glyph_type') {
        value = wordGlyphTypes.indexOf(value);
      } else if (prop == 'spell') {
        // Note: 仅取权重最高的拼音
        const spells = meta.spells.map((s) => s.value);

        value = pinyinValues.indexOf(spells[0]);
      }

      data[index] = value;
    });

    return data;
  });
writeJSONToFile(path.join(siteAssetsZiDir, 'glyphs.json'), wordGlyphData);

// ---------------------------------------------------------------
console.log();
console.log('更新数据 schema 定义 ...');

// Note: 采用数组存放数据，从而尽可能降低数据文件的总体大小
writeFile(
  path.join(siteSrcDir, 'data/schema.js'),
  `/** 统一将模型的数组数据转换为对象结构 */

// 简略汉字信息的结构
const simpleCharSchemaMapping = ${JSON.stringify(pinyinWordSchemaMapping)};
// 汉字信息的结构
const charMetaSchemaMapping = ${JSON.stringify(wordMetaSchemaMapping)};
// 汉字字形图像类型：笔画分解 or 纯字形
const charGlyphTypes = ${JSON.stringify(wordGlyphTypes)};
// 汉字字形信息结构
const charGlyphSchemaMapping = ${JSON.stringify(wordGlyphSchemaMapping)};

// 汉字结构名列表
const charStructNames = ${JSON.stringify(wordStructNames)};
// 带声调拼音列表
const pinyinValues = ${JSON.stringify(pinyinValues)};
// 有音频的拼音列表，其元素为对应拼音在 pinyinValues 中的序号
const audioPinyins = ${JSON.stringify(audioPinyins)};

export function convertSimpleCharData(data) {
  const obj = convertDataByMapping(data, simpleCharSchemaMapping);

  obj.spell = pinyinValues[obj.spell];

  return obj;
}

export function convertCharMetaData(data) {
  const obj = convertDataByMapping(data, charMetaSchemaMapping);

  obj.glyph_type = charGlyphTypes[obj.glyph_type];
  obj.struct = charStructNames[obj.struct] || '未知';
  obj.spells = obj.spells.map(s => ({
    value: pinyinValues[s], audio: audioPinyins.includes(s)
  }));

  return obj;
}

export function convertCharGlyphData(data) {
  const obj = convertDataByMapping(data, charGlyphSchemaMapping);

  obj.glyph_type = charGlyphTypes[obj.glyph_type];
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
