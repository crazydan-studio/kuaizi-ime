import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';

const data_path = (...paths) =>
  fromRootPath('../..', 'thirdparty/OpenCC/data/dictionary', ...paths);
const dict_path = (dict) => data_path(dict + '.txt');

/**
 * 从 https://github.com/BYVoid/OpenCC 中读取 繁体->简体 转换字
 *
 * @return `{'儘': ['尽', '侭'], ...}`
 */
export async function readTrad2SimpChars() {
  // https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSCharacters.txt
  const file = dict_path('TSCharacters');

  return await readMappings(file);
}

/**
 * 从 https://github.com/BYVoid/OpenCC 中读取 繁体->简体 转换短语
 *
 * @return `{'老態龍鍾': ['老态龙钟', '老态龙锺'], ...}`
 */
export async function readTrad2SimpPhrases() {
  // https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSPhrases.txt
  const file = dict_path('TSPhrases');

  return await readMappings(file);
}

/**
 * 从 https://github.com/BYVoid/OpenCC 中读取 简体->繁体 转换字
 *
 * @return `{'干': ['幹', '乾'], ...}`
 */
export async function readSimp2TradChars() {
  // https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/STCharacters.txt
  const file = dict_path('STCharacters');

  return await readMappings(file);
}

/**
 * 从 https://github.com/BYVoid/OpenCC 中读取 简体->繁体 转换短语
 *
 * @return `{'一言既出驷马难追': ['一言既出駟馬難追'], ...}`
 */
export async function readSimp2TradPhrases() {
  // https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/STPhrases.txt
  const file = dict_path('STPhrases');

  return await readMappings(file);
}

/**
 * 读取 繁/简 转换映射
 *
 * @return `{'干': ['幹', '乾'], ...}`
 */
async function readMappings(file) {
  const data = {};
  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#') || line === '') {
      return;
    }

    const segs = line.split(/\s+/);
    if (segs.length < 2) {
      return;
    }

    const word = segs[0];
    const targets = segs.filter((w) => w != word);
    if (targets.length > 0) {
      data[word] = targets;
    }
  });

  return data;
}
