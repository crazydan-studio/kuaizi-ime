import { sleep } from '#utils/native.mjs';
import { fromRootPath } from '#utils/file.mjs';
import { zeroPinyinTone, correctPinyin, correctZhuyin } from '#utils/spell.mjs';
import { getUnicode } from '#utils/zi.mjs';

import {
  openDB,
  closeDB,
  saveToDB,
  execSQLFile,
  queryAll,
  execSQL
} from '#utils/sqlite.mjs';

import { fetchZiMeta } from '#data/provider/zdic.net.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'data/zi/' + name + '.create.sql');

/** 获取字信息的 SQLite 文件 */
function getZiMetaSQLiteFile() {
  return fromRootPath('data', 'dict-raw-zi-meta.sqlite');
}

/** 读取所有有效的字信息 */
export function readAllValidZiMetas() {
  const dbFile = getZiMetaSQLiteFile();
  const db = openDB(dbFile);

  try {
    return _readAllValidZiMetas(db);
  } finally {
    closeDB(db);
  }
}

function _readAllValidZiMetas(db) {
  const ziMetas = [];

  queryAll(db, 'select * from zi_meta where valid = 1').forEach((row) => {
    const meta = fromZiMetaDBRow(row);

    ziMetas.push(meta);
  });

  return ziMetas;
}

/**
 * 补充字信息并保存至数据库，再返回全部字信息
 *
 * @return ```json
 * [{
 *    value: '㑟', unicode: 'U+345F',
 *    pinyins: ['běng', 'bó', 'pěng'],
 *    ...
 * }, ...]
 * ```
 */
export async function patchAndSaveZiMetas(thinZies) {
  const dbFile = getZiMetaSQLiteFile();
  const db = openDB(dbFile);

  const sqlFile = sql_file_path('table-meta');
  execSQLFile(db, sqlFile);

  try {
    return await _patchAndSaveZiMetas(db, thinZies);
  } finally {
    closeDB(db);
  }
}

async function _patchAndSaveZiMetas(db, thinZies) {
  const batchSize = 20;

  let savedZiMetas = [];

  // -------------------------------------------------------
  // 读取已保存数据
  const savedZies = {};
  queryAll(db, 'select * from zi_meta').forEach((row) => {
    const meta = fromZiMetaDBRow(row);

    if (shouldBeExcludedZi(meta)) {
      savedZies[meta.value] = true;

      console.log(`忽略字：${ziMetaToString(meta)}`);
      return;
    }

    const zi = thinZies[meta.value];
    if (!zi) {
      console.log(`多余字：${ziMetaToString(meta)}`);
      return;
    }

    savedZies[meta.value] = true;

    correctZiMeta(meta);

    savedZiMetas.push(meta);
  });

  // -------------------------------------------------------
  // 抓取缺失数据
  const missingZiKeys = Object.keys(thinZies).filter(
    (key) => !savedZies[key] && !shouldBeExcludedZi(thinZies[key])
  );
  // const missingZiKeys = ['㔿','韭','严'];

  if (missingZiKeys.length > 0) {
    console.log(
      `已抓取到 ${savedZiMetas.length} 条数据，继续抓取剩余的 ${missingZiKeys.length} 条数据 ...`
    );

    for (let i = 0; i < missingZiKeys.length; i += batchSize) {
      const keys = missingZiKeys.slice(i, i + batchSize);
      const metas = await getZiMetas(keys, thinZies);

      saveToDB(db, 'zi_meta', metas.map(toZiMetaDBRow), true);

      console.log(`已抓取到第 ${i + 1} 到 ${i + keys.length} 之间的数据.`);

      savedZiMetas = savedZiMetas.concat(metas);
    }
  }

  return savedZiMetas;
}

/** 获取 汉典网 中的字信息 */
async function getZiMetas(ziKeys, thinZies) {
  const ziMetas = [];

  // Note: 挨个获取以避免 "429 Too Many Requests"
  for (let ziKey of ziKeys) {
    const zi = thinZies[ziKey];
    const metaStr = ziMetaToString(zi);
    const meta = await fetchZiMeta(ziKey);

    if (meta.error) {
      console.log(`缺失字：${metaStr} => ${meta.error}`);
      continue;
    }
    // console.log(JSON.stringify(meta));

    // Note：以汉典网的拼音优先
    if (meta.pinyins.length == 0 && zi.pinyins.length > 0) {
      console.log(`汉典网无拼音的字：${metaStr}`);

      meta.pinyins = zi.pinyins;
    }

    correctZiMeta(meta);
    // console.log(JSON.stringify(meta));

    ziMetas.push(meta);

    await sleep(100);
  }

  return ziMetas;
}

/** 更新有效字的权重数据（字型权重 + 拼音使用权重）*/
export function updateValidZiMetaWeights(ziMetas) {
  const dbFile = getZiMetaSQLiteFile();
  const db = openDB(dbFile);

  try {
    return _updateValidZiMetaWeights(db, ziMetas);
  } finally {
    closeDB(db);
  }
}

function _updateValidZiMetaWeights(db, ziMetas) {
  execSQL(db, 'update zi_meta set valid = 0');

  const savedZiMetaMap = {};
  queryAll(db, 'select * from zi_meta').forEach((row) => {
    savedZiMetaMap[row.value] = row;
  });

  // -----------------------------------------------
  const updatedZiMetaMap = [];
  ziMetas.forEach((meta) => {
    const savedMeta = savedZiMetaMap[meta.value];
    if (!savedMeta) {
      return;
    }

    updatedZiMetaMap.push({
      __exist__: savedMeta,
      id_: savedMeta.id_,
      valid: 1,
      // 权重更新
      glyph_weight: meta.glyph_weight || 0,
      pinyin_used_weights: JSON.stringify(meta.pinyin_used_weights || {}),
      // 繁简修正
      traditional: meta.traditional ? 1 : 0,
      simples: JSON.stringify(meta.simples),
      traditionals: JSON.stringify(meta.traditionals)
    });
  });

  saveToDB(db, 'zi_meta', updatedZiMetaMap, true);
}

function ziMetaToString(meta) {
  return `${meta.value} - ${meta.pinyins.join(',')}`;
}

/** 将字信息对象转换为数据库行 */
function toZiMetaDBRow(meta) {
  const row = {
    ...meta,
    id_: getUnicode(meta.value),
    //
    valid: meta.valid ? 1 : 0,
    traditional: meta.traditional ? 1 : 0,
    glyph_exists: meta.glyph_exists ? 1 : 0,
    //
    glyph_weight: meta.glyph_weight || 0,
    //
    pinyins: JSON.stringify(meta.pinyins),
    pinyin_used_weights: JSON.stringify(meta.pinyin_used_weights || {}),
    zhuyins: JSON.stringify(meta.zhuyins),
    simples: JSON.stringify(meta.simples),
    variants: JSON.stringify(meta.variants),
    traditionals: JSON.stringify(meta.traditionals)
  };

  delete row.value;
  delete row.unicode;

  return row;
}

/** 将数据库行转换为字信息对象 */
function fromZiMetaDBRow(row) {
  return {
    ...row,
    //
    valid: !!row.valid,
    traditional: !!row.traditional,
    glyph_exists: !!row.glyph_exists,
    //
    pinyins: JSON.parse(row.pinyins),
    pinyin_used_weights: JSON.parse(row.pinyin_used_weights),
    zhuyins: JSON.parse(row.zhuyins),
    simples: JSON.parse(row.simples),
    variants: JSON.parse(row.variants),
    traditionals: JSON.parse(row.traditionals)
  };
}

/** 补充拼音字的使用权重（值越大，优先级越高） */
export function patchPinyinZiUsedWeight(ziMetas, pinyinZiWeightData) {
  ziMetas.forEach((meta) => {
    const zi = meta.value;

    meta.pinyin_used_weights = pinyinZiWeightData[zi] || {};
  });
}

/** 根据字形计算字的权重（值越大，排列位置越靠后） */
export function calculateZiGlyphWeight(ziMetas) {
  // 按部首分组
  const radicalGroups = {};
  // 按拼音分组
  const pinyinGroups = {};

  ziMetas.forEach((meta) => {
    meta.glyph_weight = calcGlyphWeight(meta);

    (radicalGroups[meta.radical] ||= []).push(meta);

    meta.pinyins.forEach((pinyin) => {
      const py = zeroPinyinTone(pinyin);

      (pinyinGroups[py] ||= []).push(meta);
    });
  });

  const radicalGroupKeys = Object.keys(radicalGroups);
  console.log('部首列表：', radicalGroupKeys.join(', '));
  radicalGroupKeys.forEach((radical) => {
    const metas = radicalGroups[radical].sort(
      (a, b) => a.glyph_weight - b.glyph_weight
    );

    console.log(
      `- 部首 ${radical} 按相似性排序结果：` +
        metas.map((meta) => meta.value).join(',')
    );
  });

  const pinyinGroupKeys = Object.keys(pinyinGroups);
  console.log('拼音列表：', pinyinGroupKeys.join(', '));
  pinyinGroupKeys.forEach((py) => {
    const metas = pinyinGroups[py].sort(
      (a, b) => a.glyph_weight - b.glyph_weight
    );

    console.log(
      `- 拼音 ${py} 按相似性排序结果：` +
        metas.map((meta) => meta.value).join(',')
    );
  });
}

/** 纠正字信息 */
function correctZiMeta(ziMeta) {
  if (!ziMeta.traditional) {
    ziMeta.traditional = ziMeta.simples.length > 0;
  }
  if (ziMeta.radical === '难检') {
    ziMeta.radical = '';
  }

  const glyph_struct = ziMeta.glyph_struct;
  switch (glyph_struct) {
    case '在右结构':
      ziMeta.glyph_struct = '左右结构';
      break;
    case '上下下结构':
      ziMeta.glyph_struct = '上中下结构';
      break;
    case '半包围':
      ziMeta.glyph_struct = '半包围结构';
      break;
    case '单一结构':
    case '单体结构':
    case '独体字':
    case '独体':
      ziMeta.glyph_struct = '独体结构';
      break;
    case '嵌套结构':
      ziMeta.glyph_struct = '镶嵌结构';
      break;
    case '形声；从车、古声':
    case '形声；左右结构':
      ziMeta.glyph_struct = '左右结构';
      break;
    default:
      if (glyph_struct.includes('；') || glyph_struct.includes('，')) {
        ziMeta.glyph_struct = glyph_struct.replaceAll(/[；，].+/g, '');
      }
  }

  correctZiMetaByValue(ziMeta);

  ziMeta.pinyins = ziMeta.pinyins.map((py) => correctPinyin(py));
  ziMeta.zhuyins = ziMeta.zhuyins.map((zy) => correctZhuyin(zy));

  addMissingPinyin(ziMeta);

  // 去除重复、无用读音
  ziMeta.pinyins = removeUselessSpell(ziMeta.pinyins);
  ziMeta.zhuyins = removeUselessSpell(ziMeta.zhuyins);
}

function addMissingPinyin(ziMeta) {
  const missing = getMissingPinyin();

  const pinyin = missing[ziMeta.value];
  if (!pinyin) {
    return;
  }

  pinyin.split(',').forEach((value) => {
    ziMeta.pinyins.push(value);
  });
}

function removeUselessSpell(spells) {
  const map = {};

  spells.forEach((spell) => {
    if (!shouldBeExcludedPinyin(spell)) {
      map[spell] = true;
    }
  });

  return Object.keys(map);
}

function shouldBeExcludedPinyin(pinyin) {
  switch (pinyin) {
    // https://www.zdic.net/hans/%E5%9A%B8
    case 'dím':
    // https://www.zdic.net/hans/%E4%BB%92
    case 'eo':
    // https://www.zdic.net/hans/%E7%BD%96
    case 'ra':
    // https://www.zdic.net/hans/%E3%A7%9C
    case 'laap6':
    // https://www.zdic.net/hans/%E3%B3%A5
    case 'nong4':
    // https://www.zdic.net/hans/%E5%BF%92
    // 【忒】仅保留拼音 tuī
    case 'tēi':
    //
    case 'ru4':
    case 'hen4':
    case 'dae':
    case 'hwa':
    case 'gu':
    case 'ka3':
    case 'tha3':
    case 'ga3':
    case 'mu4':
    case 'yu2':
    case 'kam4':
    case 'uo˥':
    case 'təp˥':
    case 'gi1':
    case 'ki1':
    case 'ŋiɔŋ˨˩':
    case 'nig9':
    case 'lan2':
    case 'tae':
    case 'seon':
    case 'ceon':
    case 'ceok':
    case 'lo':
    case 'dug':
    case 'dìn':
    case 'py':
      return true;
  }

  switch (zeroPinyinTone(pinyin)) {
    case 'tiaota':
    case 'pia':
    case 'kei':
    case 'ber':
    case 'yingmu':
    case 'ho':
    case 'cei':
    case 'wong':
    case 'lo':
    case 'wenn':
    case 'puti':
    case 'lüan':
    case 'yung':
    case 'sei':
    case 'pia':
    case 'yingli':
    case 'geda':
    case 'pasi':
    case 'haixun':
    case 'haili':
    case 'taojue':
    case 'feifei':
      return true;
  }

  return !pinyin;
}

function shouldBeExcludedZi(ziMeta) {
  switch (ziMeta.value) {
    // 忽略组合音
    case '瓧': // shíwǎ
    case '瓱': // máowǎ
    case '瓲': // túnwǎ
    case '瓼': // lǐwǎ
    case '瓩': // qiānwǎ
    case '瓰': // fēnwǎ
    case '兡': // bǎikè
    case '兞': // háokè
    case '兙': // shíkě
    case '兛': // qiānkè
    case '兝': // gōngfēn
    case '兣': // gōnglǐ
    case '嗧': // jiālún
    // 外文汉字
    case '怾': // gi
    case '兺': // būn
    case '乲': // cal
    case '乥': // hol
    case '厼': // keum
    case '哛': // ppun
    case '唟': // keos
    case '囕': // ramo
    case '夞': // oes
    case '朰': // teul
    case '桛': // kasei
    case '硛': // ceok
    case '迲': // keop
    case '闏': // phdeng
    // 无效字：与已有字相似，但笔画线条不同
    case '羽':
    case '﨤':
    case '﨩':
    case '僧':
    case '捐':
      return true;
  }
  return false;
}

function getMissingPinyin() {
  return {
    挼: 'ruó',
    禑: 'wú',
    𤭢: 'suì',
    𥌩: 'tè',
    作: 'zuō',
    轉: 'zhuàn',
    色: 'shǎi',
    荷: 'hè',
    叉: 'chà',
    拉: 'lǎ',
    踏: 'tā',
    骑: 'jì',
    靡: 'mǐ',
    處: 'chù',
    虎: 'hū',
    隆: 'lōng',
    興: 'xìng',
    與: 'yù',
    衩: 'chǎ',
    荷: 'hè',
    鑽: 'zuàn',
    綠: 'lù',
    頻: 'pín',
    衝: 'chòng',
    嘀: 'dī',
    夻: 'qù',
    叾: 'dū,dǔ,dù',
    硳: 'chì',
    縇: 'xuān',
    襨: 'duì',
    猠: 'diǎn',
    𩏑: 'hán'
    // 伯: 'bo',
    // 子: 'zi',
    // 儿: 'er',
    // 们: 'men',
    // 娃: 'wa',
    // 奶: 'nai',
    // 哥: 'ge',
    // 妈: 'ma',
    // 妹: 'mei',
    // 姐: 'jie',
    // 姥: 'lao',
    // 弟: 'di',
    // 爷: 'ye',
    // 丧: 'sang',
    // 罗: 'luo',
    // 嗦: 'suo',
    // 虎: 'hu',
    // 担: 'dan',
    // 掇: 'duo',
    // 量: 'liang',
    // 声: 'sheng',
    // 叨: 'dao',
    // 吵: 'chao',
    // 伙: 'huo',
    // 壳: 'ke',
    // 父: 'fu',
    // 和: 'huo',
    // 落: 'luo',
    // 星: 'xing',
    // 友: 'you',
    // 服: 'fu',
    // 糊: 'hu',
    // 息: 'xi',
    // 係: 'xi',
    // 思: 'si',
    // 兒: 'er',
    // 巴: 'ba',
    // 候: 'hou',
    // 猬: 'wei',
    // 弹: 'tan',
    // 彈: 'tan',
    // 乎: 'hu',
    // 承: 'cheng',
    // 彩: 'cai',
    // 轳: 'lu',
    // 呃: 'e',
    // 嗯: 'ng',
    // 馬: 'ma',
    // 璃: 'li',
    // 頭: 'tou',
    // 矩: 'ju',
    // 荷: 'he',
    // 狸: 'li',
    // 聲: 'sheng',
    // 结: 'jie',
    // 傅: 'fu',
    // 羅: 'luo',
    // 磨: 'mo',
    // 睛: 'jing',
    // 识: 'shi',
    // 宜: 'yi',
    // 迷: 'mi',
    // 督: 'du',
    // 饨: 'tun',
    // 膊: 'bo',
    // 噷: 'hm',
  };
}

function correctZiMetaByValue(ziMeta) {
  // 笔画顺序：1 - 横/提，2 - 竖，3 - 撇，4 - 捺/点，5 - 折
  switch (ziMeta.value) {
    case '𩭳':
      ziMeta.pinyins = ['huō'];
      break;
    case '𧵻':
      ziMeta.pinyins = ['huó'];
      break;
    case '𦨯':
      ziMeta.pinyins = ['huó'];
      break;
    case '㣫': // ㄓㄨㄥˇㄉㄨㄥˋ
      ziMeta.zhuyins = ['ㄓㄨㄥˇ', 'ㄉㄨㄥˋ'];
      break;
    case '頁': // ㄧㄝˋ，ㄒ〡ㄝˊ
      ziMeta.zhuyins = ['ㄧㄝˋ', 'ㄒ〡ㄝˊ'];
      break;
  }
}

const glyphStructBaseWeight = 100;
const glyphRadicalBaseWeight = 100;
const glyphStrokeBaseWeight = 100;
const glyphStrokeCountWeight = 10000;
const globalRadicalWeights = {};
function calcGlyphWeight(meta) {
  // 结构权重 (按视觉复杂度排序)
  const structWeights = [
    '独体结构',
    '左右结构',
    '上下结构',
    '左中右结构',
    '上中下结构',
    '半包围结构',
    '全包围结构',
    '上包围结构',
    '下包围结构',
    '左包围结构',
    '右包围结构',
    '左下包围结构',
    '左上包围结构',
    '右上包围结构',
    '品字结构',
    '镶嵌结构',
    '未知'
  ];

  // 笔画权值 (1 - 横/提，2 - 竖，3 - 撇，4 - 捺/点，5 - 折)
  const strokeWeights = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

  // - 结构权重
  const structWeight =
    ((structWeights.indexOf(meta.glyph_struct) || structWeights.length) + 1) *
    glyphStructBaseWeight;

  // - 部首权重
  //   - 相同笔画数的部首放在一起，再以其所在序号参与权重计算
  const radicals = (globalRadicalWeights[meta.radical_stroke_count] ||= []);
  if (!radicals.includes(meta.radical)) {
    radicals.push(meta.radical);
  }
  const radicalWeight =
    meta.radical_stroke_count *
    (radicals.indexOf(meta.radical) + 1) *
    glyphRadicalBaseWeight;

  // - 笔顺特征权重 (使用加权和，前几笔权重更高)：第 i 笔笔画权重 * (衰减系数 ^ i)
  const strokes = meta.stroke_order.split('');
  const strokeWeight = strokes.reduce((acc, type) => {
    const val = (strokeWeights[type] || 10) * glyphStrokeBaseWeight;

    return acc + val;
  }, 0);

  // - 笔画数权重
  const strokeCountWeight = strokes.length * glyphStrokeCountWeight;

  return structWeight + radicalWeight + strokeWeight + strokeCountWeight;
}
