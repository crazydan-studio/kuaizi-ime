import {
  sleep,
  readLineFromFile,
  appendLineToFile,
  extractPinyinChars,
  extractZhuyinChars,
  correctPinyin,
  correctZhuyin,
  calculateStrokeSimilarity,
  splitChars
} from '../../utils/utils.mjs';
import { fetchWordMetas } from '../../utils/zdic.mjs';

/** 从 https://github.com/mozillazg/pinyin-data 中读取汉典网的数据 */
export async function readZDicWordsFromPinyinData(file) {
  const data = await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#') || line === '') {
      return;
    }

    const unicode = line.replaceAll(/^([^:]+):.+/g, '$1');
    const joinedPinyin = line
      .replaceAll(/^.+:\s*([^\s]+)\s*#.*/g, '$1')
      .replaceAll(/["']/g, '');
    if (joinedPinyin === '') {
      return;
    }

    const word = line.replaceAll(/^.+#\s*([^\s]+).*$/g, '$1');
    const pinyins = joinedPinyin.split(/,/g).map((value) => ({ value }));
    //console.log('Read ' + line);

    return { value: word, unicode, pinyins };
  });

  return data;
}

/** 从 https://github.com/BYVoid/OpenCC 中读取繁体字 */
export async function readTraditionalWordsFromOpenCC(file) {
  const data = {};

  await readLineFromFile(file, (line) => {
    line = line.trim();

    const word = line.replaceAll(/^([^\s]+).+/g, '$1');
    data[word] = true;
  });

  return data;
}

/** 读取字的使用信息 */
export async function readWordUsage(file) {
  const data = {};

  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#')) {
      return;
    }

    const splits = line.split(/\s*,\s*/g);
    const value = splits[0];

    let weight = Math.round(parseFloat(splits[1]) * 10000);
    weight = weight < 1 ? 1 : weight > 40000 ? weight - 30000 : weight;

    data[value] = (data[value] || 0) + weight;
  });

  return data;
}

/** 读取词的使用信息 */
export async function readPhraseUsage(file) {
  const data = {};

  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#')) {
      return;
    }

    const splits = line.split(/\s*,\s*/g);
    const value = splits[0];
    if (splitChars(value).length < 2) {
      return;
    }

    let weight = Math.round(parseFloat(splits[1]) * 10000);
    weight = weight < 1 ? 1 : weight;

    data[value] = (data[value] || 0) + weight;
  });

  return data;
}

/** 获取 汉典网 中的字信息 */
export async function getWordMetasFromZDic(words) {
  const wordMap = words.reduce((map, word) => {
    map[word.value] = word;
    return map;
  }, {});
  const wordMetas = await fetchWordMetas(words.map((w) => w.value));

  wordMetas.forEach((meta) => {
    const word = wordMap[meta.value];
    if (!word) {
      return;
    }

    meta.traditional ||= word.traditional;
    if (meta.pinyins.length === 0 && word.pinyins.length > 0) {
      meta.pinyins = word.pinyins;
    }
  });

  return wordMetas;
}

/**
 * 补充 汉典网 中的字信息并按行保存为 json 数组数据，
 * 返回全部字信息
 */
export async function patchAndSaveZDicWordsToFile(file, zdicWords) {
  const batchSize = 20;

  const zdicWordMap = zdicWords.reduce((map, word) => {
    map[word.value] = word;
    return map;
  }, {});

  const savedWordMetas = [];
  await readLineFromFile(file, (line) => {
    if (!line || !line.trim()) {
      return;
    }

    const metas = JSON.parse(line);
    metas.forEach((meta) => {
      if (shouldBeExcluded(meta)) {
        console.log(
          `忽略字：${meta.value} - ${meta.pinyins
            .map((p) => p.value)
            .join(',')}`
        );
        delete zdicWordMap[meta.value];

        return;
      }

      const zdicWord = zdicWordMap[meta.value];
      if (zdicWord) {
        if (meta.pinyins.length === 0) {
          meta.pinyins = zdicWord.pinyins;
        }

        delete zdicWordMap[meta.value];
      } else {
        console.log(
          `多余字：${meta.value} - ${meta.pinyins
            .map((p) => p.value)
            .join(',')}`
        );
      }

      correctWordMeta(meta);
      savedWordMetas.push(meta);
    });
  });

  const missingWords = Object.keys(zdicWordMap).map((k) => zdicWordMap[k]);
  console.log(
    `已抓取到 ${savedWordMetas.length} 条数据，继续抓取剩余的 ${missingWords.length} 条数据 ...`
  );

  for (let i = 0; i < missingWords.length; i += batchSize) {
    const words = missingWords.slice(i, i + batchSize);
    const metas = await getWordMetasFromZDic(words);

    metas.forEach((meta) => {
      correctWordMeta(meta);
      savedWordMetas.push(meta);
    });
    appendLineToFile(file, JSON.stringify(metas));

    console.log(`已抓取到第 ${i + 1} 到 ${i + 1 + batchSize} 之间的数据.`);

    await sleep(3000);
  }

  return savedWordMetas;
}

/** 保存字信息到指定文件 */
export function saveWordMetasToFile(file, wordMetas) {
  const batchSize = 50;

  for (let i = 0; i < wordMetas.length; i += batchSize) {
    const metas = wordMetas.slice(i, i + batchSize);

    // Note: 首行写入前，先清空文件
    appendLineToFile(file, JSON.stringify(metas), i === 0);
  }
}

/** 增加字使用权重 */
export function plusWordUsageWeight(wordMetas, usages) {
  wordMetas.forEach((meta) => {
    let weight = usages[meta.value] || 0;
    if (weight <= 0) {
      return;
    }

    // 以拼音内最大字数为基数，在使用权重上加上该基数，
    // 以确保处于最后位置的常用字能够靠前排列
    weight += 1000;
    meta.pinyins.forEach((pinyin) => {
      pinyin.weight = (pinyin.weight || 0) + weight;
    });
  });
}

/** 增加词使用权重 */
export function plusPhraseUsageWeight(wordMetas, usages) {
  wordMetas.forEach((meta) => {
    meta.phrases.forEach((phrase) => {
      let weight = usages[phrase.value.join('')] || 0;
      if (weight <= 0) {
        return;
      }

      phrase.weight = (phrase.weight || 0) + weight + 1000;
    });
  });
}

/** 根据字形计算字的权重 */
export function calculateWordWeightByGlyph(wordMetas) {
  // // 按部首分组，再按相似性计算字形权重
  // const radicalGroups = wordMetas.reduce((map, meta) => {
  //   (map[meta.radical] ||= []).push(meta);

  //   return map;
  // }, {});

  // console.log('部首列表：', Object.keys(radicalGroups).join(', '));

  // let baseWeight = 0;
  // Object.keys(radicalGroups)
  //   .sort((r1, r2) => {
  //     const r1_count = radicalGroups[r1][0].radical_stroke_count;
  //     const r2_count = radicalGroups[r2][0].radical_stroke_count;

  //     return r1_count - r2_count;
  //   })
  //   // 越复杂的部首，其权重越低
  //   .reverse()
  //   .forEach((radical) => {
  //     // if (radical !== '门') {
  //     //   return;
  //     // }

  //     let metas = radicalGroups[radical];

  //     metas = sortWordMetasBySimilarity(metas);
  //     console.log(
  //       `- 部首 ${radical} 按相似性排序结果：` +
  //         metas.map((meta) => meta.value).join(',')
  //     );

  //     // Note: 基数按部首分组的字数累加
  //     baseWeight += metas.length + 10;

  //     for (let i = 0; i < metas.length; i++) {
  //       const meta = metas[i];

  //       meta.weight = baseWeight - i;
  //     }
  //   });

  // 按拼音分组，再按相似性计算字形权重
  const pinyinCharsGroups = wordMetas.reduce((map, meta) => {
    meta.pinyins.forEach((pinyin) => {
      (map[pinyin.chars] ||= []).push(meta);
    });

    return map;
  }, {});

  let baseWeight = 0;
  Object.keys(pinyinCharsGroups).forEach((chars) => {
    // if (chars !== 'yi') {
    //   return;
    // }

    let metas = pinyinCharsGroups[chars];

    metas = sortWordMetasBySimilarity(metas);
    console.log(
      `- 拼音 ${chars} 按相似性排序结果：` +
        metas.map((meta) => meta.value).join(',')
    );

    // Note: 基数按部首分组的字数累加
    baseWeight += metas.length + 10;

    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];

      meta.weight = baseWeight - i;
    }
  });
}

function sortWordMetasBySimilarity(wordMetas) {
  const total = wordMetas.length;
  if (total <= 1) {
    return wordMetas;
  }

  // 按笔画数由低到高排序
  wordMetas.sort((a, b) => a.total_stroke_count - b.total_stroke_count);
  console.log('- 按笔画数排序结果：' + wordMetas.map((m) => m.value).join(','));

  const similarities = {};
  const getSimilarity = (w1, w2) => {
    let similarity = similarities[`${w1.value}:${w2.value}`];
    if (typeof similarity === 'undefined') {
      similarity = similarities[`${w2.value}:${w1.value}`];
    }

    if (typeof similarity === 'undefined') {
      similarity = calculateStrokeSimilarity(w1.stroke_order, w2.stroke_order);
      similarities[`${w1.value}:${w2.value}`] = similarity;
    }

    return similarity;
  };

  // 按相似性排序
  // console.log('- 按字间相似度排序 ...');
  const results = wordMetas;
  for (let i = 0; i < total; i++) {
    const source_i = results[i];

    // console.log(`  - 排序第 ${i + 1} 个字 ...`);
    for (let j = i + 1; j < total; j++) {
      let target_j = results[j];
      let similarity_j = getSimilarity(source_i, target_j);

      for (let k = j + 1; k < total; k++) {
        const target_k = results[k];
        const similarity_k = getSimilarity(source_i, target_k);

        // 相似度高的往前靠
        if (similarity_k > 0.45 && similarity_k - similarity_j > 0.15) {
          results[j] = target_k;
          results[k] = target_j;

          target_j = target_k;
          similarity_j = similarity_k;
        }
      }
    }
  }

  return results;
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
    case '㣫': // ㄓㄨㄥˇㄉㄨㄥˋ
      wordMeta.zhuyins = [
        {
          value: 'ㄓㄨㄥˇ',
          audio_url: 'https://img.zdic.net/audio/zd/zy/ㄓㄨㄥˇ.mp3'
        },
        {
          value: 'ㄉㄨㄥˋ',
          audio_url: 'https://img.zdic.net/audio/zd/zy/ㄉㄨㄥˋ.mp3'
        }
      ];
      break;
    case '頁': // ㄧㄝˋ，ㄒ〡ㄝˊ
      wordMeta.zhuyins = [
        {
          value: 'ㄧㄝˋ',
          audio_url: 'https://img.zdic.net/audio/zd/zy/ㄧㄝˋ.mp3'
        },
        {
          value: 'ㄒ〡ㄝˊ',
          audio_url: 'https://img.zdic.net/audio/zd/zy/ㄒ〡ㄝˊ.mp3'
        }
      ];
      break;
  }

  if (wordMeta.stroke_order) {
    wordMeta.total_stroke_count = wordMeta.stroke_order.length;
  }

  // 去除重复读音
  wordMeta.pinyins = removeDuplicateSpell(wordMeta.pinyins);
  wordMeta.zhuyins = removeDuplicateSpell(wordMeta.zhuyins);

  wordMeta.pinyins = wordMeta.pinyins.filter(
    (data) =>
      // https://www.zdic.net/hans/%E5%9A%B8
      data.value !== 'dím' &&
      // https://www.zdic.net/hans/%E4%BB%92
      data.value !== 'eo' &&
      // https://www.zdic.net/hans/%E7%BD%96
      data.value !== 'ra'
  );
  addMissingPinyin(wordMeta);

  wordMeta.pinyins.forEach((data) => {
    switch (data.value) {
      case 'yòu ㄧ':
        data.value = 'yòu';
        break;
    }

    data.value = correctPinyin(data.value);
    data.audio_url && (data.audio_url = correctPinyin(data.audio_url));
    data.chars = extractPinyinChars(data.value);
  });
  wordMeta.zhuyins.forEach((data) => {
    data.value = correctZhuyin(data.value);
    data.chars = extractZhuyinChars(data.value);

    if (data.chars === 'ㄏπ') {
      console.log(wordMeta.value, data);
    }
  });

  wordMeta.phrases = wordMeta.phrases.filter(
    (phrase) =>
      phrase.value &&
      phrase.value.length > 1 &&
      !phrase.value.includes('…') &&
      phrase.pinyins.filter((p) => !!p).length > 0
  );
  wordMeta.phrases.forEach((phrase) => {
    phrase.pinyins.forEach((data) => {
      data.value = data.value.map(correctPinyin);
    });

    correctPhrasePinyin(phrase);
  });
}

function shouldBeExcluded(wordMeta) {
  switch (wordMeta.value) {
    // 忽略组合音
    case '瓧': // shíwǎ
    case '瓱': // máowǎ
    case '瓲': // túnwǎ
    case '瓼': // lǐwǎ
    case '甅': // líwǎ
    case '瓩': // qiānwǎ
    case '瓰': // fēnwǎ
    case '兡': // bǎikè
    case '兞': // háokè
    case '兙': // shíkě
    case '兛': // qiānkè
    case '兝': // gōngfēn
    case '兣': // gōnglǐ
    case '嗧': // jiālún
    case '𧟰': // fiào
    // 外文汉字
    case '怾': // gi
    case '兺': // būn
    case '乲': // cal
    case '乥': // hol
    case '厼': // keum
    case '哛': // ppun
    case '唜': // mas
    case '唟': // keos
    case '喸': // phos
    case '囕': // ramo
    case '夞': // oes
    case '巼': // phas
    case '旕': // eos
    case '朰': // teul
    case '栍': // saeng
    case '桛': // kasei
    case '椧': // myeong
    case '猠': // ceon
    case '硛': // ceok
    case '硳': // ceok
    case '穒': // kweok
    case '莻': // neus
    case '虄': // sal
    case '迲': // keop
    case '闏': // phdeng
    case '叾': // dug
    case '縇': // seon
    case '襨': // tae
      return true;
  }
  return false;
}

function addMissingPinyin(wordMeta) {
  const missing = {
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
    膊: 'bo'
  };

  const pinyin = missing[wordMeta.value];
  if (pinyin) {
    wordMeta.pinyins = wordMeta.pinyins.filter((data) => data.value !== pinyin);
    wordMeta.pinyins.push({
      value: pinyin
    });
  }
}

function correctPhrasePinyin(phrase) {
  const replacements = {
    '不:bu': 'bù',
    '不:bū': 'bù',
    '不:bǔ': 'bù',
    '不:bú': 'bù',
    '作:zuó': 'zuò',
    '帆:fán': 'fān',
    '一:yí': 'yī',
    '一:yì': 'yī',
    '溜:liú': 'liù',
    '归:huī': 'guī',
    '观:guāng': 'guān',
    '民:rén': 'mín',
    '偏:piāng': 'piān',
    '內:nà': 'nèi',
    '外:wai': 'wài',
    '訌:hóng': 'hòng',
    '長:zhàng': 'cháng',
    '教:jiàn': 'jiào',
    '寻:xín': 'xún',
    '将:qiāng': 'jiāng',
    '寸:cù': 'cùn',
    '傅:fū': 'fu',
    '练:zh': 'liàn',
    '穴:xuè': 'xué',
    '野:yiě': 'yě',
    '子:zī': 'zi',
    '家:ji': 'jiā',
    '手:shǒ': 'shǒu',
    '瘩:dā': 'da',
    '度:duò': 'duó',
    '进:lián': 'jìn',
    '扬:yán': 'yáng',
    '期:qí': 'qī',
    '骨:gú': 'gǔ',
    '实:shi': 'shí',
    '衣:yì': 'yī',
    '縱:zōng': 'zòng',
    '魄:tuò': 'pò',
    '首:shǒ': 'shǒu',
    '三:sā': 'sān',
    '個:ge': 'gè',
    '业:yiè': 'yè',
    '行:héng': 'háng',
    '歸:huī': 'guī'
  };

  phrase.pinyins.forEach((pinyin) => {
    if (phrase.value.length !== pinyin.value.length) {
      return;
    }

    for (let i = 0; i < phrase.value.length; i++) {
      const code = `${phrase.value[i]}:${pinyin.value[i]}`;
      const replacement = replacements[code];

      if (replacement) {
        pinyin.value.splice(i, 1, replacement);
      }
    }
  });
}

function removeDuplicateSpell(spells) {
  const map = spells.reduce((map, spell) => {
    if (!map[spell.value]) {
      map[spell.value] = spell;
    }
    return map;
  }, {});

  return Object.values(map);
}
