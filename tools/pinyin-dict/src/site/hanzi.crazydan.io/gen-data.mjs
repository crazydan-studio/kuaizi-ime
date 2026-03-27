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
const pinyinSchemaMapping = { audio: 0 };

console.log();
console.log('复制拼音音频文件到目标站点 ...');
const pinyinAudios = getAllFiles(pinyinAudiosDir);

const pinyinAudioMap = {};
pinyinAudios.forEach((file) => {
  const name = path.basename(file);

  const data = [];
  data[pinyinSchemaMapping.audio] = name;

  pinyinAudioMap[name.replace(/\.mp3$/g, '')] = data;

  const target = path.join(siteAssetsDir, `audio/pinyin/${name}`);
  copyFile(file, target, false);
});

writeJSONToFile(path.join(siteAssetsPinyinDir, 'data.json'), pinyinAudioMap);

console.log('- 已复制音频文件总数：' + pinyinAudios.length);
console.log();

// ---------------------------------------------------------------
const wordStructNames = [];

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
  let struct = wordStructNames.indexOf(glyph_struct);
  if (struct < 0 && !!glyph_struct) {
    wordStructNames.push(glyph_struct);

    struct = wordStructNames.length - 1;
  }

  wordMetaMap[word] = {
    value: word,
    unicode: meta.unicode,
    spells: meta.pinyins.sort((p1, p2) => p2.used_weight - p1.used_weight),
    radical: meta.radical,
    stroke_count: meta.total_stroke_count,
    struct
  };
});

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
      data[pinyinWordSchemaMapping.spell] = spells[0];

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
console.log();
console.log('保存常用字列表 ...');
const commonWords = Object.keys(wordWeightMap)
  .sort((w1, w2) => wordWeightMap[w2] - wordWeightMap[w1])
  .slice(0, 3500)
  .map((w) => {
    // Note: 仅取权重最高的拼音
    const spells = wordMetaMap[w].spells.map((s) => s.value);

    const data = [];
    data[pinyinWordSchemaMapping.value] = w;
    data[pinyinWordSchemaMapping.spell] = spells[0];

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
  stroke_svg: 5,
  glyph_svg: 6
};

console.log();
console.log('保存单字详细信息 ...');
Object.keys(wordMetaMap).forEach((word) => {
  const meta = wordMetaMap[word];
  const unicode = meta.unicode;

  const glyphSvgFile = path.join(ziMediasDir, `${unicode}/glyph.svg`);
  const strokeDemoFile = path.join(ziMediasDir, `${unicode}/stroke-demo.gif`);

  if (existFile(strokeDemoFile)) {
    // Note: 笔画 svg 图像由 shell 脚本生成
    meta.stroke_svg = 'stroke.svg';

    const target = path.join(siteAssetsZiDir, `${unicode}/${meta.stroke_svg}`);
    const svg = readFile(target);
    if (svg) {
      // Note: 笔画数始终与笔画动画中的笔画数保持一致
      const strokeCount = (svg.match(/<g\s+id="s-\d+"/g) || []).length;
      if (strokeCount != meta.stroke_count) {
        console.log(
          `- ${word} 的笔画图像包含 ${strokeCount} 个笔画，但其数据中记录的笔画数为 ${meta.stroke_count}`
        );
      }
    }
  }

  if (!meta.stroke_svg && existFile(glyphSvgFile)) {
    meta.glyph_svg = 'glyph.svg';

    const target = path.join(siteAssetsZiDir, `${unicode}/${meta.glyph_svg}`);
    copyFile(glyphSvgFile, target, false);
  }

  if (!meta.stroke_svg && !meta.glyph_svg) {
    console.log(`- ${word} 没有字形和笔画动画图像文件`);
  }

  const data = [];
  Object.keys(wordMetaSchemaMapping).forEach((prop) => {
    const index = wordMetaSchemaMapping[prop];

    let value = meta[prop];
    if (prop == 'spells') {
      value = value.map((s) => s.value);
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
console.log();
console.log('更新数据 schema 定义 ...');

// Note: 采用数组存放数据，从而尽可能降低数据文件的总体大小
writeFile(
  path.join(siteSrcDir, 'data/schema.mjs'),
  `// 统一将模型的数组数据转换为对象结构
const pinyinSchemaMapping = ${JSON.stringify(pinyinSchemaMapping)};
const simpleCharSchemaMapping = ${JSON.stringify(pinyinWordSchemaMapping)};
const charMetaSchemaMapping = ${JSON.stringify(wordMetaSchemaMapping)};
const wordStructNames = ${JSON.stringify(wordStructNames)};

export function convertSimpleCharData(data) {
  return convertDataByMapping(data, simpleCharSchemaMapping);
}

export function convertCharMetaData(data) {
  const meta = convertDataByMapping(data, charMetaSchemaMapping);

  meta.struct = wordStructNames[meta.struct] || '未知';

  return meta;
}

export function convertPinyinData(data) {
  return convertDataByMapping(data, pinyinSchemaMapping);
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
