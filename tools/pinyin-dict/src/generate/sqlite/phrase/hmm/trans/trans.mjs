import { getPinyinTone, getPinyin } from '#utils/utils.mjs';
import { countTrans, countWords } from '../utils.mjs';

/**
 * HMM 参数计算
 * trans_prob - 汉字间转移概率
 */
export function countParams(sampleText, words, existParams) {
  const clauses = extractClauses(sampleText, words);

  existParams = existParams || { word_prob: {}, trans_prob: {} };

  return {
    // 字的出现次数
    word_prob: countWords(clauses, existParams.word_prob),
    // 当前字为 EOS 且其前序为 BOS 的转移次数即为 训练的句子总数，
    // 而各个包含 BOS 前序的字即为句首字，且其出现次数即为 BOS 的值
    trans_prob: countTrans(clauses, existParams.trans_prob)
  };
}

// extractClauses('迈向/v  充满/v  希望/n  的/u  新/a  世纪/n', {
//   力: true,
//   争: true,
//   达: true,
//   到: true,
//   万: true,
//   标: true,
//   准: true,
//   箱: true
// });
/** 拆分样本数据，按汉字短句返回 */
export function extractClauses(sampleText, words) {
  const clauses = getClauses(sampleText, words);

  const result = [];
  clauses.forEach((clause) => {
    const phrase = clause.join('');
    const pinyins = clause.map(getPinyin).reduce((ret, p) => ret.concat(p), []);

    // console.log(`  - 获取拼音 for ${phrase} ...`);

    // 直接按 字:拼音 进行统计，故，无需再计算 拼音-汉字发射概率
    const pinyinWords = correctPinyin(phrase, pinyins, words);
    // 忽略包含无效拼音的短语
    if (pinyinWords.includes(null)) {
      console.log(
        `  - 忽略包含无效拼音的短语 '${phrase}': `,
        pinyinWords
          .map((p, i) => (p ? null : `${phrase.charAt(i)}:${pinyins[i]}`))
          .filter((w) => !!w)
          .join()
      );
      return;
    }

    result.push(pinyinWords);
  });

  return result;
}

/** @return [['迈向', '充满', '的'], [...], ...] */
export function getClauses(sampleText, words) {
  const clauses = [];

  let clause = [];
  const splittedPhrases = sampleText.split(/\/[a-z]+\s+/g);
  for (let phrase of splittedPhrases) {
    if (isValidPhrase(phrase, words)) {
      clause.push(phrase);
    } else {
      if (clause.length > 0) {
        clauses.push(clause);
      }
      clause = [];
    }
  }

  return clauses;
}

function isValidPhrase(phrase, words) {
  const excludes = ['丨', '丶', '氵'];

  for (let i = 0; i < phrase.length; i++) {
    const word = phrase.charAt(i);

    if (!words[word] || excludes.includes(word)) {
      return false;
    }
  }
  return true;
}

/** @return ['迈:mài', ...] */
function correctPinyin(clause, pinyins, words) {
  return pinyins.map((pinyin, index) => {
    let word = clause.charAt(index);
    const wordCode = `${word}:${pinyin}`;
    const prevWord = clause.charAt(index - 1);
    const postWord = clause.charAt(index + 1);
    const postPinyin = pinyins[index + 1] || '';

    // 唯一拼音
    const uniques = {
      '上:shang': 'shàng',
      '生:sheng': 'shēng',
      '娘:niang': 'niáng',
      '袱:fu': 'fú',
      '伍:wu': 'wǔ',
      '事:shi': 'shì',
      '情:qing': 'qíng',
      '下:xia': 'xià',
      '同:tong': 'tóng',
      '个:ge': 'gè',
      '喇:lā': 'lǎ',
      '姑:gu': 'gū',
      '闹:nao': 'nào',
      '实:shi': 'shí',
      '人:ren': 'rén',
      '萄:tao': 'táo',
      '究:jiu': 'jiū',
      '太:tai': 'tài',
      '芦:lu': 'lú',
      '嚣:áo': 'xiāo',
      '篷:peng': 'péng',
      '哈:ha': 'hā',
      '亮:liang': 'liàng',
      '栏:lan': 'lán',
      '悉:xi': 'xī',
      '桃:tao': 'táo',
      '气:qi': 'qì',
      '户:hu': 'hù',
      '脯:pú': 'fǔ',
      '敞:chang': 'chǎng',
      '复:fu': 'fù',
      '务:wu': 'wù',
      '歌:ge': 'gē',
      '欢:huan': 'huān',
      '氛:fen': 'fēn',
      '宝:bao': 'bǎo',
      '蟆:ma': 'má',
      '利:li': 'lì',
      '成:cheng': 'chéng',
      '婆:po': 'pó',
      '甲:jia': 'jiǎ',
      '腐:fu': 'fǔ',
      '摸:mo': 'mō',
      '郗:chī': 'xī',
      '女:nü': 'nǚ',
      '才:cai': 'cái',
      '蛐:qu': 'qū',
      '呼:hu': 'hū',
      '话:hua': 'huà',
      '嫂:sao': 'sǎo',
      '辑:ji': 'jí',
      '算:suan': 'suàn',
      '烦:fan': 'fán',
      '屉:ti': 'tì',
      '方:fang': 'fāng',
      '叔:shu': 'shū',
      '应:ying': 'yìng',
      '戚:qi': 'qī',
      '麻:ma': 'má',
      '拉:la': 'lā',
      '司:si': 'sī',
      '瑰:gui': 'guī',
      '牌:pai': 'pái',
      '疾:ji': 'jí',
      '误:wu': 'wù',
      '叭:ba': 'bā',
      '付:fu': 'fù',
      '蠡:lí': 'lǐ',
      '镗:táng': 'tāng',
      '毛:mao': 'máo',
      '荡:dang': 'dàng',
      '拾:shi': 'shí',
      '系:xi': 'xì',
      '妇:fu': 'fù',
      '仗:zhang': 'zhàng',
      '面:mian': 'miàn',
      '甥:sheng': 'shēng',
      '快:kuai': 'kuài',
      '婿:xu': 'xù',
      '计:ji': 'jì',
      '明:ming': 'míng',
      '琶:pa': 'pá',
      '遛:liú': 'liù',
      '兄:xiong': 'xiōng',
      '搁:ge': 'gē',
      '们:men': 'mén',
      '友:you': 'yǒu',
      '生:sheng': 'shēng',
      '难:nan': 'nán',
      '分:fen': 'fēn',
      '识:shi': 'shí',
      '食:shi': 'shí',
      '下:xia': 'xià',
      '氛:fen': 'fēn',
      '得:de': 'dé',
      '星:xing': 'xīng',
      '笼:long': 'lóng',
      '爷:ye': 'yé',
      '奶:nai': 'nǎi',
      '爸:ba': 'bà',
      '妈:ma': 'mā',
      '儿:er': 'ér',
      '哥:ge': 'gē',
      '服:fu': 'fú',
      '睛:jing': 'jīng',
      '弟:di': 'dì',
      '妹:mei': 'mèi',
      '司:si': 'sī',
      '候:hou': 'hòu',
      '腾:teng': 'téng',
      '璃:li': 'lí',
      '息:xi': 'xī',
      '傅:fu': 'fù',
      '娃:wa': 'wá',
      '卖:mai': 'mài',
      '屈:qu': 'qū',
      '思:si': 'sī',
      '活:huo': 'huó',
      '量:liang': 'liáng',
      '伯:bo': 'bó',
      '丧:sang': 'sàng',
      '嗦:suo': 'suō',
      '当:dang': 'dāng',
      '咕:gu': 'gū',
      '巴:ba': 'bā',
      '粑:ba': 'bā',
      '矩:ju': 'jǔ',
      '发:fa': 'fà',
      '合:he': 'hé',
      '帚:zhou': 'zhǒu',
      '蛋:dan': 'dàn',
      '枉:wang': 'wǎng',
      '泡:pao': 'pào',
      '酬:chou': 'chóu',
      '股:gu': 'gǔ',
      '剔:ti': 'tī',
      '西:xi': 'xī',
      '糊:hu': 'hú',
      '元:yuan': 'yuán',
      '杠:gang': 'gàng',
      '乎:hu': 'hū',
      '猬:wei': 'wèi',
      '指:zhi': 'zhǐ',
      '撒:sa': 'sā',
      '瞧:qiao': 'qiáo',
      '磨:mo': 'mó',
      '坊:fang': 'fáng',
      '叨:dao': 'dāo',
      '蹭:ceng': 'cèng',
      '姐:jie': 'jiě',
      '狸:li': 'lí',
      '楼:lou': 'lóu',
      '膊:bo': 'bó',
      '堂:tang': 'táng',
      '涂:tu': 'tú',
      '负:fu': 'fù',
      '灵:ling': 'líng',
      '菇:gu': 'gū',
      '舅:jiu': 'jiù',
      '饼:bing': 'bǐng',
      '罕:han': 'hǎn',
      '药:yao': 'yào',
      '筝:zheng': 'zhēng',
      '框:kuang': 'kuàng',
      '转:zhuan': 'zhuàn',
      '壳:ke': 'ké',
      '忽:hu': 'hū',
      '荒:huang': 'huāng',
      '莉:li': 'lì',
      '悠:you': 'yōu',
      '士:shi': 'shì',
      '嚷:rang': 'rāng',
      '笆:ba': 'bā',
      '窿:long': 'lóng',
      '缝:feng': 'féng',
      '口:kou': 'kǒu',
      '末:mo': 'mò',
      '里:li': 'lǐ',
      '叽:ji': 'jī',
      '心:xin': 'xīn',
      '宗:zong': 'zōng',
      '姥:lao': 'lǎo',
      '喝:he': 'hē',
      '伙:huo': 'huǒ',
      '囊:nang': 'nāng',
      '物:wu': 'wù',
      '嗽:sou': 'sòu',
      '咙:long': 'lóng',
      '': '',
      // 占位用
      _: ''
    };

    // 在 四声字 前念 二声：不要、不错、不是、不再、不认识
    if (word == '不' && ['bu'].includes(pinyin)) {
      const tone = getPinyinTone(postPinyin);
      if (tone == 4) {
        pinyin = 'bú';
      } else if (tone != 0 || ['得'].includes(postWord)) {
        pinyin = 'bù';
      }
    }
    // 在 四声 前念 二声：一样，一下子、一座、一位、一次、一块儿
    // 在 一声、二声、三声字 前念 四声：大吃一惊、一般、一年、一门、一口、一起、一种
    else if (word == '一' && ['yi'].includes(pinyin)) {
      const tone = getPinyinTone(postPinyin);
      if (tone == 4) {
        pinyin = 'yí';
      } else if (tone != 0) {
        pinyin = 'yì';
      }
    } else if (word == '同' && ['胡'].includes(prevWord)) {
      pinyin = 'tòng';
    } else if (word == '蕃' && ['茄'].includes(postWord)) {
      word = '番';
      pinyin = 'fān';
    } else if (word == '蕃' && ['吐'].includes(prevWord)) {
      pinyin = 'bō';
    } else if (word == '朵' && ['耳'].includes(prevWord)) {
      pinyin = 'duo';
      return `${word}:${pinyin}`;
    } else if (
      word == '脯' &&
      (['胸'].includes(prevWord) || ['子'].includes(postWord))
    ) {
      pinyin = 'pú';
    } else if (
      word == '夫' &&
      ['丈', '工', '功', '姐', '大', '妹'].includes(prevWord)
    ) {
      pinyin = 'fū';
    } else if (word == '喇' && ['喇', '哗', '呼', '喀'].includes(prevWord)) {
      pinyin = 'lā';
    }
    // 姓氏：https://baike.baidu.com/item/%E5%96%87%E5%A7%93/9730899
    else if (
      word == '喇' &&
      (['哈', '半'].includes(prevWord) || ['进', '敏', '秉'].includes(postWord))
    ) {
      pinyin = 'lá';
    } else if (
      word == '大' &&
      ['士'].includes(prevWord) &&
      ['夫'].includes(postWord)
    ) {
      pinyin = 'dà';
    } else if (word == '大' && ['夫'].includes(postWord)) {
      pinyin = 'dài';
    } else if (
      word == '个' &&
      ['自'].includes(prevWord) &&
      ['儿'].includes(postWord)
    ) {
      pinyin = 'gě';
    }
    //
    else if (uniques[wordCode]) {
      pinyin = uniques[wordCode];
    }

    if (!words[word].includes(pinyin)) {
      return null;
    }

    if (
      words[word].length > 1 &&
      getPinyinTone(pinyin) == 0 &&
      ![
        '的',
        '不',
        '一',
        '着',
        '么',
        '了',
        '子',
        '啊',
        '呢',
        '吧',
        '宜',
        '吗',
        '家',
        '头',
        '呀',
        '卜',
        '和',
        '嘛',
        '地',
        '匙',
        '啦',
        '裳',
        '瘩',
        '喽'
      ].includes(word)
    ) {
      return null;
    }

    return `${word}:${pinyin}`;
  });
}
