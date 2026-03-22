import { sleep } from '#utils/native.mjs';
import {
  fromRootPath,
  readLineFromFile,
  appendLineToFile
} from '#utils/file.mjs';
import {
  extractPinyinChars,
  correctPinyin,
  correctZhuyin
} from '#utils/spell.mjs';

import { fetchWordMeta } from '#data/provider/zdic.net.mjs';

/** 获取字信息的存储文件 */
export function getWordMetasSavedFile() {
  return fromRootPath('data', 'pinyin-dict.valid.txt');
}

/** 读取所有已保存的字信息 */
export async function readAllSavedWordMetas() {
  const wordMetas = [];

  const file = getWordMetasSavedFile();
  await readLineFromFile(file, (line) => {
    if (!line || !line.trim()) {
      return;
    }

    const metas = JSON.parse(line);
    metas.forEach((meta) => {
      wordMetas.push(meta);
    });
  });
  return wordMetas;
}

/**
 * 补充字信息并按行保存为 json 数组数据，返回全部字信息
 *
 * @return ```json
 * [{
 *    value: '㑟', unicode: 'U+345F',
 *    pinyins: [{value: 'běng'}, {value: 'bó'}, {value: 'pěng'}],
 *    ...
 * }, ...]
 * ```
 */
export async function patchWordMetaAndSaveToFile(thinWords, file) {
  const batchSize = 20;

  let savedWordMetas = [];

  const savedWords = {};
  await readLineFromFile(file, (line) => {
    if (!line || !line.trim()) {
      return;
    }

    const metas = JSON.parse(line);
    metas.forEach((meta) => {
      if (shouldBeExcludedWord(meta)) {
        savedWords[meta.value] = true;

        console.log(`忽略字：${wordMetaToString(meta)}`);
        return;
      }

      const word = thinWords[meta.value];
      if (!word) {
        console.log(`多余字：${wordMetaToString(meta)}`);
        return;
      }

      savedWords[meta.value] = true;

      correctWordMeta(meta);

      savedWordMetas.push(meta);
    });
  });

  const missingWordKeys = Object.keys(thinWords).filter(
    (key) => !savedWords[key] && !shouldBeExcludedWord(thinWords[key])
  );
  if (missingWordKeys.length > 0) {
    console.log(
      `已抓取到 ${savedWordMetas.length} 条数据，继续抓取剩余的 ${missingWordKeys.length} 条数据 ...`
    );

    for (let i = 0; i < missingWordKeys.length; i += batchSize) {
      const keys = missingWordKeys.slice(i, i + batchSize);
      const metas = await getWordMetas(keys, thinWords);

      appendLineToFile(file, JSON.stringify(metas));
      console.log(`已抓取到第 ${i + 1} 到 ${i + keys.length} 之间的数据.`);

      savedWordMetas = savedWordMetas.concat(metas);
    }
  }

  return savedWordMetas;
}

/** 获取 汉典网 中的字信息 */
async function getWordMetas(wordKeys, thinWords) {
  const wordMetas = [];

  // Note: 挨个获取以避免 "429 Too Many Requests"
  for (let wordKey of wordKeys) {
    const word = thinWords[wordKey];
    const meta = await fetchWordMeta(wordKey);

    if (!meta.src_url) {
      console.log(`缺失字：${wordMetaToString(word)}`);
      continue;
    }

    if (meta.pinyins.length == 0) {
      meta.pinyins = word.pinyins || [];
    }

    correctWordMeta(meta);

    wordMetas.push(meta);

    await sleep(100);
  }

  return wordMetas;
}

/** 保存字信息到指定文件 */
export function saveWordMetasToFile(wordMetas, file) {
  const batchSize = 50;

  for (let i = 0; i < wordMetas.length; i += batchSize) {
    const metas = wordMetas.slice(i, i + batchSize);

    // Note: 首行写入前，先清空文件
    appendLineToFile(file, JSON.stringify(metas), i === 0);
  }
}

function wordMetaToString(meta) {
  const pinyins = meta.pinyins.map((py) => py.value).join(',');
  return `${meta.value} - ${pinyins}`;
}

/** 补充字拼音的使用权重（值越大，优先级越高） */
export function patchWordPinyinUsedWeight(wordMetas, wordPinyinWeightData) {
  wordMetas.forEach((meta) => {
    const word = meta.value;

    const pinyinWeights = wordPinyinWeightData[word];
    if (!pinyinWeights) {
      return;
    }

    meta.pinyins.forEach((pinyin) => {
      pinyin.used_weight = pinyinWeights[pinyin.value] || 0;
    });
  });
}

/** 根据字形计算字的权重（值越大，排列位置越靠后） */
export function calculateWordGlyphWeight(wordMetas) {
  // 按部首分组
  const radicalGroups = {};
  // 按拼音分组
  const pinyinCharsGroups = {};

  wordMetas.forEach((meta) => {
    meta.glyph_weight = calcGlyphWeight(meta);

    (radicalGroups[meta.radical] ||= []).push(meta);

    meta.pinyins.forEach((pinyin) => {
      const chars = extractPinyinChars(pinyin.value);
      (pinyinCharsGroups[chars] ||= []).push(meta);
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

  const pinyinCharsGroupKeys = Object.keys(pinyinCharsGroups);
  console.log('拼音列表：', pinyinCharsGroupKeys.join(', '));
  pinyinCharsGroupKeys.forEach((chars) => {
    const metas = pinyinCharsGroups[chars].sort(
      (a, b) => a.glyph_weight - b.glyph_weight
    );

    console.log(
      `- 拼音 ${chars} 按相似性排序结果：` +
        metas.map((meta) => meta.value).join(',')
    );
  });
}

/** 纠正字信息 */
function correctWordMeta(wordMeta) {
  if (!wordMeta.traditional) {
    wordMeta.traditional = wordMeta.simple_words.length > 0;
  }
  if (wordMeta.radical === '难检') {
    wordMeta.radical = '';
  }

  const glyph_struct = wordMeta.glyph_struct;
  switch (glyph_struct) {
    case '在右结构':
      wordMeta.glyph_struct = '左右结构';
      break;
    case '上下下结构':
      wordMeta.glyph_struct = '上中下结构';
      break;
    case '半包围':
      wordMeta.glyph_struct = '半包围结构';
      break;
    case '单一结构':
    case '单体结构':
    case '独体字':
    case '独体':
    case '嵌套结构':
      wordMeta.glyph_struct = '独体结构';
      break;
    case '形声；从车、古声':
    case '形声；左右结构':
      wordMeta.glyph_struct = '左右结构';
      break;
    default:
      if (glyph_struct.includes('；') || glyph_struct.includes('，')) {
        wordMeta.glyph_struct = glyph_struct.replaceAll(/[；，].+/g, '');
      }
  }

  correctWordMetaByWord(wordMeta);

  if (wordMeta.stroke_order) {
    wordMeta.total_stroke_count = wordMeta.stroke_order.length;
  }

  wordMeta.pinyins.forEach((data) => {
    data.value = correctPinyin(data.value);
  });
  wordMeta.zhuyins.forEach((data) => {
    data.value = correctZhuyin(data.value);

    if (data.value === 'ㄏπ') {
      console.log(wordMeta.value, data);
    }
  });

  // 去除重复、无用读音
  wordMeta.pinyins = removeUselessSpell(wordMeta.pinyins);
  wordMeta.zhuyins = removeUselessSpell(wordMeta.zhuyins);

  addMissingPinyin(wordMeta);
}

function addMissingPinyin(wordMeta) {
  const missing = getMissingPinyin();

  const pinyin = missing[wordMeta.value];
  if (pinyin) {
    wordMeta.pinyins = wordMeta.pinyins.filter((data) => data.value !== pinyin);
    wordMeta.pinyins.push({
      value: pinyin
    });
  }
}

function removeUselessSpell(spells) {
  const map = {};
  spells.forEach((spell) => {
    if (shouldBeExcludedPinyin(spell)) {
      return;
    }

    const value = spell.value;
    const old = map[value] || {};
    map[value] = Object.assign(old, spell);
  });

  return Object.values(map);
}

function shouldBeExcludedPinyin(pinyin) {
  switch (pinyin.value) {
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
    case 'pià':
    case 'kēi':
    case 'ru4':
    case 'bēr':
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
    case 'yīngmǔ':
    case 'gi1':
    case 'ki1':
    case 'ŋiɔŋ˨˩':
    case 'nig9':
    case 'hó':
    case 'hǒ':
    case 'cèi':
    case 'wòng':
    case 'lò':
    case 'lan2':
      return true;
  }
  return !pinyin.value;
}

function shouldBeExcludedWord(wordMeta) {
  switch (wordMeta.value) {
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
    伯: 'bo',
    作: 'zuō',
    轉: 'zhuàn',
    子: 'zi',
    儿: 'er',
    们: 'men',
    娃: 'wa',
    奶: 'nai',
    哥: 'ge',
    妈: 'ma',
    妹: 'mei',
    姐: 'jie',
    姥: 'lao',
    弟: 'di',
    爷: 'ye',
    丧: 'sang',
    罗: 'luo',
    嗦: 'suo',
    虎: 'hu',
    担: 'dan',
    色: 'shǎi',
    掇: 'duo',
    量: 'liang',
    声: 'sheng',
    叨: 'dao',
    吵: 'chao',
    嗦: 'suo',
    伙: 'huo',
    壳: 'ke',
    父: 'fu',
    和: 'huo',
    落: 'luo',
    星: 'xing',
    友: 'you',
    服: 'fu',
    糊: 'hu',
    息: 'xi',
    係: 'xi',
    思: 'si',
    兒: 'er',
    荷: 'hè',
    巴: 'ba',
    候: 'hou',
    猬: 'wei',
    叉: 'chà',
    弹: 'tan',
    彈: 'tan',
    拉: 'lǎ',
    乎: 'hu',
    承: 'cheng',
    彩: 'cai',
    踏: 'tā',
    骑: 'jì',
    轳: 'lu',
    靡: 'mǐ',
    處: 'chù',
    呃: 'e',
    嗯: 'ng',
    虎: 'hū',
    馬: 'ma',
    璃: 'li',
    隆: 'lōng',
    頭: 'tou',
    矩: 'ju',
    荷: 'he',
    興: 'xìng',
    與: 'yù',
    狸: 'li',
    聲: 'sheng',
    结: 'jie',
    傅: 'fu',
    羅: 'luo',
    磨: 'mo',
    睛: 'jing',
    衩: 'chǎ',
    识: 'shi',
    宜: 'yi',
    荷: 'hè',
    迷: 'mi',
    督: 'du',
    鑽: 'zuàn',
    饨: 'tun',
    綠: 'lù',
    頻: 'pín',
    衝: 'chòng',
    膊: 'bo',
    嘀: 'dī',
    噷: 'hm',
    夻: 'qù'
  };
}

function correctWordMetaByWord(wordMeta) {
  // 笔画顺序：1 - 横/提，2 - 竖，3 - 撇，4 - 捺/点，5 - 折
  switch (wordMeta.value) {
    case '贋':
    case '尨':
    case '戍':
    case '成':
    case '龙':
    case '戌':
    case '烕':
    case '辰':
      wordMeta.glyph_struct = '左上包围结构';
      break;
    case '匚':
    case '匸':
    case '巨':
    case '臣':
      wordMeta.glyph_struct = '左包围结构';
      break;
    case '用':
    case '甩':
    case '冂':
    case '円':
    case '几':
    case '凡':
      wordMeta.glyph_struct = '上包围结构';
      break;
    case '龵':
      wordMeta.stroke_order = '3113';
      break;
    case '龷':
      wordMeta.stroke_order = '1221';
      break;
    case '龹':
      wordMeta.stroke_order = '431134';
      break;
    case '龻':
      wordMeta.stroke_order = '4111251554444554444';
      break;
    case '﨩':
      wordMeta.stroke_order = '523251115252';
      break;
    case '龧':
      wordMeta.stroke_order = '2511251112132511';
      break;
    case '龦':
      wordMeta.stroke_order = '433424345251252';
      break;
    case '龨':
      wordMeta.stroke_order = '1324111215';
      break;
    case '龪':
      wordMeta.stroke_order = '121213434';
      break;
    case '龫':
      wordMeta.stroke_order = '125111234112';
      break;
    case '龮':
      wordMeta.stroke_order = '121125444453353325121122134';
      break;
    case '龯':
      wordMeta.stroke_order = '3411243113534';
      break;
    case '龰':
      wordMeta.stroke_order = '2134';
      break;
    case '龱':
      wordMeta.stroke_order = '25134';
      break;
    case '𢅫':
      wordMeta.stroke_order = '252111211125114544';
      break;
    case '龲':
      wordMeta.stroke_order = '341124314131251112';
      break;
    case '龺':
      wordMeta.stroke_order = '12251112';
      break;
    case '鿃':
      wordMeta.stroke_order = '251111343434';
      break;
    case '鿄':
      wordMeta.stroke_order = '4415341234';
      break;
    case '鿌':
      wordMeta.stroke_order = '441412511234';
      break;
    case '卝':
      wordMeta.radical = '卝';
      wordMeta.radical_stroke_count = 4;
      break;
    case '㴝':
      wordMeta.radical = '水';
      wordMeta.radical_stroke_count = 4;
      break;
    case '凱':
      wordMeta.radical = '几';
      wordMeta.radical_stroke_count = 2;
      break;
    case '彛':
    case '彞':
      wordMeta.radical = '廾';
      wordMeta.radical_stroke_count = 3;
      break;
    case '瑴':
      wordMeta.radical = '殳';
      wordMeta.radical_stroke_count = 4;
      break;
    case '羋':
      wordMeta.radical = '干';
      wordMeta.radical_stroke_count = 3;
      break;
    case '羐':
      wordMeta.radical = '艹';
      wordMeta.radical_stroke_count = 3;
      break;
    case '龜':
    case '龞':
      wordMeta.radical = '龟';
      wordMeta.radical_stroke_count = 21;
      break;
    case '〇':
      // 取 囗 的笔顺
      wordMeta.stroke_order = '251';
      wordMeta.total_stroke_count = 3;
      wordMeta.radical_stroke_count = 3;
    case '囗':
    case '曰':
    case '田':
      wordMeta.glyph_struct = '全包围结构';
      break;
    case '弐':
    case '彧':
    case '丸':
    case '为':
    case '习':
    case '刁':
    case '刀':
    case '刃':
    case '刄':
    case '勹':
    case '勺':
    case '匁':
    case '匆':
      wordMeta.glyph_struct = '右上包围结构';
      break;
    case '彐':
      wordMeta.glyph_struct = '右包围结构';
      break;
    case '圡':
    case '玊':
      wordMeta.glyph_struct = '独体结构';
      break;
    case '娈':
    case '蒧':
    case '斎':
    case '齋':
    case '齌':
    case '齎':
    case '齏':
    case '䂖':
    case '羗':
    case '矛':
    case '耉':
    case '穴':
    case '欠':
    case '业':
    case '亟':
    case '止':
    case '畢':
    case '革':
    case '韭':
      wordMeta.glyph_struct = '上下结构';
      break;
    case '䙪':
    case '豆':
    case '亚':
    case '亘':
      wordMeta.glyph_struct = '上中下结构';
    case '承':
      wordMeta.glyph_struct = '左中右结构';
      break;
    case '竹':
      wordMeta.glyph_struct = '左右结构';
      break;
    case '𩭳':
      wordMeta.pinyins = [{ value: 'huō' }];
      break;
    case '𧵻':
      wordMeta.pinyins = [{ value: 'huó' }];
      break;
    case '𦨯':
      wordMeta.pinyins = [{ value: 'huó' }];
      break;
    case '㣫': // ㄓㄨㄥˇㄉㄨㄥˋ
      wordMeta.zhuyins = [{ value: 'ㄓㄨㄥˇ' }, { value: 'ㄉㄨㄥˋ' }];
      break;
    case '頁': // ㄧㄝˋ，ㄒ〡ㄝˊ
      wordMeta.zhuyins = [{ value: 'ㄧㄝˋ' }, { value: 'ㄒ〡ㄝˊ' }];
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
    '品字结构'
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
