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
export async function saveWordMetasToFile(file, wordMetas) {
  const batchSize = 50;

  for (let i = 0; i < wordMetas.length; i += batchSize) {
    const metas = wordMetas.slice(i, i + batchSize);

    // Note: 首行写入前，先清空文件
    appendLineToFile(file, JSON.stringify(metas), i === 0);
  }
}

/** 纠正字信息 */
function correctWordMeta(wordMeta) {
  if (!wordMeta.traditional) {
    wordMeta.traditional = wordMeta.simple_words.length > 0;
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
