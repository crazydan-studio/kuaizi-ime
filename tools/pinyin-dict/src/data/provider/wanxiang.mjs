import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';

const data_path = () => fromRootPath('../..', 'thirdparty/rime_wanxiang');
function getDictPath(dict) {
  return fromRootPath(data_path(), 'dicts/' + dict + '.dict.yaml');
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

/**
 * 从 https://github.com/amzxyz/rime_wanxiang 中读取标点符号
 *
 * @return `{'星座': [{value: '♈', name: '白羊座'}, ...], ...}`
 */
export async function readSymbols() {
  const file = fromRootPath(data_path(), 'wanxiang_symbols.yaml');
  const lineSymbols = {};
  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (!line.startsWith("'/")) {
      return;
    }

    const name = line.replace(/:.+/g, '').replace(/'/g, '');
    const segs = line
      .replace(/^.+:\s+/g, '')
      .replace(/\[\s+|\s+\]/g, '')
      .split(/,\s+/);

    lineSymbols[name] = segs;
  });

  const symbolGroups = {
    电脑: ['/dn'],
    棋牌: ['/xq', '/mj', '/sz', '/pk'],
    音乐: ['/yy'],
    两性: ['/lx'],
    八卦: [{ '/bg': '/bgm' }, { '/lssg': '/lssgm' }, '/txj'],
    天体: ['/tt'],
    星座: [{ '/xz': '/xzm' }],
    星号: ['/wjx', '/xh'],
    方块: ['/fk'],
    几何: ['/jh'],
    箭头: ['/jt'],
    数学: ['/sx', '/dy', '/xy', '/yw', '/sy', '/lm', '/lmd', '/xl', '/xld'],
    分数: ['/fs'],
    序号: [
      '/szq',
      '/szh',
      '/szd',
      '/uzq',
      '/uzh',
      '/uzd',
      '/zmq',
      '/zmh',
      '/hzq',
      '/hzh',
      '/jmq',
      '/hwq',
      '/hwh'
    ],
    计数: ['/szm', '/scsz', '/sch', '/scz', '/xxtj', '/xftj'],
    单位: ['/dw'],
    货币: ['/hb'],
    上下标: ['/sb', '/xb'],
    其他: ['/fh', '/aj', '/tsfh', '/jg']
  };

  Object.keys(symbolGroups).forEach((groupName) => {
    const symbols = [];

    symbolGroups[groupName].forEach((code) => {
      let names = [];
      let values = [];

      if (typeof code != 'string') {
        names = lineSymbols[Object.values(code)[0]];
        values = lineSymbols[Object.keys(code)[0]];
      } else {
        values = lineSymbols[code];
      }

      values.forEach((value, i) => {
        const name = names[i];

        symbols.push(name ? { value, name } : { value });
      });
    });

    symbolGroups[groupName] = symbols;
  });

  return symbolGroups;
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
