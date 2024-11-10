import { extractPinyinChars } from '#utils/utils.mjs';
import { countTrans, countWords } from '../utils.mjs';

/**
 * HMM 参数计算
 * trans_prob - 汉字间转移概率
 */
export function countParams(articles, words, existParams) {
  const clauses = readClausesFromArticles(articles, words);

  existParams = existParams || { word_prob: {}, trans_prob: {} };

  return {
    // 字的出现次数
    word_prob: countWords(clauses, existParams.word_prob),
    // 当前字为 EOS 且其前序为 BOS 的转移次数即为 训练的句子总数，
    // 而各个包含 BOS 前序的字即为句首字，且其出现次数即为 BOS 的值
    trans_prob: countTrans(clauses, existParams.trans_prob)
  };
}

/**
 * @param articles <pre>[{title: [...], subtitle: [...], pargraphs: [[...], ...]}, {...}, ...]</pre>
 */
function readClausesFromArticles(articles, words) {
  let clauses = [];

  articles.forEach(({ title, subtitle, pargraphs }) => {
    console.log(`  - 分析文章: ${title.map((w) => w.zi).join('')}`);

    [title, subtitle].concat(pargraphs).forEach((p) => {
      clauses = clauses.concat(readClausesFromPargraph(p, words));
    });
  });

  return clauses;
}

/**
 * @param pargraph <pre>[{zi: '字', py: 'zì'}, {zi: '，'}, {...}, ...]</pre>
 */
function readClausesFromPargraph(pargraph, words) {
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

      if (spells.includes(py)) {
        clause.push(`${zi}:${py}`);
      } else {
        console.error(`  - 不存在拼音字: ${curr.zi}:${curr.py}`);
      }
    } else if (zi == '“' && prev.py) {
      // 忽略字与字间的引号
    }
    // 短语结束
    else {
      if (clause.length > 0) {
        addClause(clause);
      }
      clause = [];
    }
  }
  addClause(clause);

  return clauses;
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
    case '其':
      py = 'qí';
      break;
    case '实':
      py = 'shí';
      break;
    case '他':
      py = 'tā';
      break;
    case '朴':
      py = 'pǔ';
      break;
    case '笼':
      py = 'lóng';
      break;
    case '牛':
      py = 'niú';
      break;
    case '妞':
      py = 'niū';
      break;
    case '剔':
      py = 'tī';
      break;
    case '菇':
      py = 'gū';
      break;
    case '活':
      py = 'huó';
      break;
    case '笛':
      py = 'dí';
      break;
    case '杵':
      py = 'chǔ';
      break;
    case '釭':
      py = 'gāng';
      break;
    // <<<<<<<<<<<<<<<<<<<<<
    case '碌':
      ['lū', 'lu'].includes(py) && (py = 'lù');
      break;
    case '莫':
      py == 'mo' && (py = 'mò');
      break;
    case '夫':
      py == 'fu' && (py = 'fū');
      break;
    case '么':
      py == 'mò' && (py = 'me');
      break;
    case '少':
      py == 'shāo' && (py = 'shǎo');
      break;
    case '搁':
      py == 'ge' && (py = 'gē');
      break;
    case '地':
      py == 'di' && (py = 'dì');
      break;
    case '呵':
      py == 'ā' && (py = 'a');
      break;
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
    case '墩':
      py = 'dūn';
      break;
    case '褂':
      py = 'guà';
      break;
    case '势':
      py = 'shì';
      break;
    case '猴':
      py = 'hóu';
      break;
    case '点':
      py = 'diǎn';
      break;
    case '劲':
      py == 'jìnr' && (py = 'jìn');
      break;
    // >>>>>>>>>>>>>>>>>>>>>
  }

  return py;
}
