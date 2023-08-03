import {
  sleep,
  readLineFromFile,
  appendLineToFile,
  extracePinyinChars,
  extraceZhuyinChars,
  correctPinyin,
  correctZhuyin
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

/** 根据字形计算字的权重 */
export function calculateWordWeightByGlyph(wordMetas) {
  // TODO 先按结构分类，再在结构内根据笔画顺序和相似性排序，最后结构权重加上字序权重即为字的权重
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
      wordMeta.glyph_struct = '左上包围结构';
      break;
    case '〇':
      wordMeta.glyph_struct = '独体结构';
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

  wordMeta.pinyins = wordMeta.pinyins.filter(
    (data) =>
      // https://www.zdic.net/hans/%E5%9A%B8
      data.value !== 'dím' &&
      // https://www.zdic.net/hans/%E4%BB%92
      data.value !== 'eo'
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
    data.chars = extracePinyinChars(data.value);
  });
  wordMeta.zhuyins.forEach((data) => {
    data.value = correctZhuyin(data.value);
    data.chars = extraceZhuyinChars(data.value);

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
