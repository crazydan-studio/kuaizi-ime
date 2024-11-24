import { extractPinyinChars } from '#utils/utils.mjs';
import { countTrans, countWords } from '../utils.mjs';

/**
 * HMM 参数计算
 * trans_prob - 汉字间转移概率
 */
export function countParams(articles, words, existParams) {
  existParams = existParams || { word_prob: {}, trans_prob: {} };

  const symbols = existParams.symbols || {};
  const clauses = readClausesFromArticles(articles, words, symbols);

  return {
    // 字的出现次数
    word_prob: countWords(clauses, existParams.word_prob),
    // 当前字为 EOS 且其前序为 BOS 的转移次数即为 训练的句子总数，
    // 而各个包含 BOS 前序的字即为句首字，且其出现次数即为 BOS 的值
    trans_prob: countTrans(clauses, existParams.trans_prob),
    // 所用到的符号及其出现次数
    symbols
  };
}

/**
 * @param articles <pre>[{title: [...], subtitle: [...], pargraphs: [[...], ...]}, {...}, ...]</pre>
 */
function readClausesFromArticles(articles, words, symbols) {
  let clauses = [];

  articles.forEach(({ title, subtitle, pargraphs }) => {
    const titleText = title.map((w) => w.zi).join('');

    if (
      titleText.includes('生字表') ||
      titleText.includes('写字表') ||
      titleText.includes('识字表') ||
      titleText.includes('练习版')
    ) {
      console.log(`  - 忽略文章: ${titleText}`);
      return;
    }
    console.log(`  - 分析文章: ${titleText}`);

    [title, subtitle].concat(pargraphs).forEach((p) => {
      clauses = clauses.concat(readClausesFromPargraph(p, words, symbols));
    });
  });

  return clauses;
}

/**
 * @param pargraph <pre>[{zi: '字', py: 'zì'}, {zi: '，'}, {...}, ...]</pre>
 */
function readClausesFromPargraph(pargraph, words, symbols) {
  const clauses = [];
  const addClause = (c) => {
    c.length > 0 && clauses.push(c);
    // c.length > 0 && console.error(c.join(','));
  };

  let clause = [];
  for (let i = 0; i < pargraph.length; i++) {
    const prev = pargraph[i - 1] || {};
    const curr = pargraph[i];
    const zi = getCorrectWord(curr);
    const py = getCorrectPinyin(curr, prev);

    if (py) {
      const spells = words[zi] || [];

      if (/\w+/.test(zi)) {
        console.error(`  - 非汉字：${curr.zi}:${curr.py}`);
      } else if (spells.includes(py)) {
        clause.push(`${zi}:${py}`);
      } else {
        console.error(`  - 不存在拼音字: ${curr.zi}:${curr.py}`);
      }
    } else {
      symbols[zi] ||= 0;
      symbols[zi] += 1;

      // 短语结束
      if (isClauseEnd(zi)) {
        if (clause.length > 0) {
          addClause(clause);
        }
        clause = [];
      }
    }
  }
  addClause(clause);

  return clauses;
}

function isClauseEnd(zi) {
  return ['，', '。', '；', '：', '？', '！', '∶', '…'].includes(zi);
}

function getCorrectWord({ zi, py }) {
  switch (zi) {
    case '轮':
      py == 'lūn' && (zi = '抡');
      break;
    case '纤':
      // https://www.cngwzj.com/pygushi/SongDai/72474/
      py == 'lián' && (zi = '廉');
      break;
    case '沉':
      // https://www.cngwzj.com/pygushi/SongDai/61484/
      py == 'shěn' && (zi = '沈');
      break;
    case '挡':
      // https://www.cngwzj.com/pygushi/SongDai/57152/
      // https://baike.baidu.com/item/%E5%BA%86%E5%AE%AB%E6%98%A5%C2%B7%E5%8F%8C%E6%A1%A8%E8%8E%BC%E6%B3%A2/9918314
      py == 'dāng' && (zi = '珰');
      break;
  }
  return zi;
}

function getCorrectPinyin({ zi, py }, prev) {
  switch (zi) {
    // <<<<<<<<<<<<<<<<<<<<<<
    case '看':
      prev.zi == zi && (py = 'kàn');
      break;
    // <<<<<<<<<<<<<<< 叠词：第二个字为轻声
    case '爸':
    case '妈':
    case '哥':
    case '弟':
    case '姐':
    case '妹':
    case '爷':
    case '奶':
    case '婶':
    case '叔':
      prev.zi == zi && (py = extractPinyinChars(py));
      break;
    // <<<<<<<<<<<<<<<<<<<<<<<
    case '儿':
      ['墩', '褂', '势', '猴', '点', '劲'].includes(prev.zi) && (py = 'ér');
      break;
    // >>>>>>>>>>>>>>>>>>>>>
    default:
      const replacements = {
        其: 'qí',
        实: 'shí',
        他: 'tā',
        朴: 'pǔ',
        笼: 'lóng',
        牛: 'niú',
        妞: 'niū',
        剔: 'tī',
        菇: 'gū',
        活: 'huó',
        笛: 'dí',
        杵: 'chǔ',
        釭: 'gāng',
        墩: 'dūn',
        褂: 'guà',
        势: 'shì',
        猴: 'hóu',
        点: 'diǎn',
        //
        '景:ijǐng': 'jǐng',
        '温:yùn': 'wēn',
        '篷:peng': 'péng',
        '蓬:peng': 'péng',
        '晨:chen': 'chén',
        '袋:dai': 'dài',
        '来:lai': 'lái',
        '枉:wang': 'wǎng',
        '蟆:ma': 'má',
        '铛:dang': 'dāng',
        '闷:men': 'mèn',
        '粱:liang': 'liáng',
        '里:li': 'lǐ',
        '角:gǔ': 'jiǎo',
        '那:nàr': 'nà',
        '时:shi': 'shí',
        '焚:fèn': 'fén',
        '亮:liang': 'liàng',
        '道:dao': 'dào',
        '家:gū': 'jiā',
        '司:si': 'sī',
        '上:shang': 'shàng',
        '是:shi': 'shì',
        '不:bu': 'bù',
        '芦:lu': 'lú',
        '莫:mo': 'mò',
        '夫:fu': 'fū',
        '么:mò': 'me',
        '少:shāo': 'shǎo',
        '搁:ge': 'gē',
        '地:di': 'dì',
        '呵:ā': 'a',
        '劲:jìnr': 'jìn',
        '碌:lū': 'lù',
        '碌:lu': 'lù'
      };

      for (let key of Object.keys(replacements)) {
        if ([zi, `${zi}:${py}`].includes(key)) {
          py = replacements[key];
          break;
        }
      }
  }

  return py;
}
