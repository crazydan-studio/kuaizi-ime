import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';

function getDictPath(dict) {
  return fromRootPath(
    '../..',
    'thirdparty/rime_wanxiang/dicts/' + dict + '.dict.yaml'
  );
}

/**
 * 从 https://github.com/amzxyz/rime_wanxiang 中读取字数据
 *
 * @return `{'㑟': {'běng': 1, 'bó': 1, pěng': 1}, ...}`
 */
export async function readZiData() {
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/zi.dict.yaml
  const file = getDictPath('zi');

  return await readMappings(file);
}

/**
 * 从 https://github.com/amzxyz/rime_wanxiang 中读取基础短语数据
 *
 * @return `{'左右不分': {'zuǒ yòu bù fēn': 109}, ...}`
 */
export async function readBasicPhrases() {
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/jichu.dict.yaml
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/duoyin.dict.yaml
  const files = [getDictPath('jichu'), getDictPath('duoyin')];

  return await readMappingsFromFiles(files);
}

/**
 * 从 https://github.com/amzxyz/rime_wanxiang 中读取其他短语数据
 *
 * @return `{'君不见黄河之水天上来': {'jūn bú jiàn huáng hé zhī shuǐ tiān shàng lái': 1}, ...}`
 */
export async function readOtherPhrases() {
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/diming.dict.yaml
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/wuzhong.dict.yaml
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/lianxiang.dict.yaml
  // https://github.com/amzxyz/rime_wanxiang/blob/wanxiang/dicts/shici.dict.yaml
  const files = [
    getDictPath('diming'),
    getDictPath('wuzhong'),
    //
    getDictPath('lianxiang'),
    getDictPath('shici')
  ];

  return await readMappingsFromFiles(files);
}

async function readMappingsFromFiles(files) {
  const data = {};
  for (let file of files) {
    await readMappings(file, data);
  }
  return data;
}

/**
 * 读取 `字/词 拼音 权重` 的映射数据
 * @returns `{'㑟': {'běng': 1, 'bó': 1, pěng': 1}, ...}`
 */
async function readMappings(file, data = {}) {
  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#') || line === '') {
      return;
    }

    const segs = line.split(/\s+/);
    const lastIndex = segs.length - 1;
    if (lastIndex < 2 || !/\d+/.test(segs[lastIndex])) {
      return;
    }

    const key = segs[0];
    const pinyin = segs.slice(1, lastIndex).join(' ');
    const weight = parseInt(segs[lastIndex]);

    const pinyins = data[key] || { [pinyin]: 0 };
    pinyins[pinyin] += weight;

    data[key] = pinyins;
  });

  return data;
}
