import { pinyin } from 'pinyin';

// split('力争达到１０００万标准箱\n', {
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
export function split(sampleText, words) {
  const phrases = [];

  let phrase_size = 0;
  const total = sampleText.length;
  for (let i = 0; i <= total; i++) {
    const ch = sampleText.charAt(i);

    if (words[ch]) {
      phrase_size += 1;
      continue;
    }

    if (phrase_size > 0) {
      const phrase = sampleText.substring(i - phrase_size, i);
      phrases.push(phrase);
    }
    phrase_size = 0;
  }

  console.log(phrases);

  return phrases;
}

/**
 * HMM 参数计算
 * init_prob - 汉字初始概率
 * emiss_prob - 拼音对多音汉字的发射概率
 * trans_prob - 汉字间转移概率
 */
export function create(phrases) {
  return {
    init_prob: count_init(phrases),
    emiss_prob: count_emiss(phrases),
    trans_prob: count_trans(phrases)
  };
}

/** 计算汉字初始概率：每个汉字作为句首的概率 */
function count_init(phrases) {
  const init_prob = {};

  return init_prob;
}

// '''
// 计算汉字初始概率：每个汉字作为句首的概率
// '''
// def count_init(seqs):
//     init_prob = {}
//     num = 0
//     len_ = len(seqs)
//     for seq in seqs:
//         init_prob[seq[0]] = init_prob.get(seq[0], 0) + 1

//         num +=1
//         if not num % 10000:
//             print('{}/{}'.format(num, len_))

//     # normalize
//     # log
//     total = len(seqs)
//     for key in init_prob.keys():
//         init_prob[key] = math.log(init_prob.get(key) / total)

/**
 * 计算 拼音-汉字发射概率：每个拼音对应的汉字以及次数（多音汉字即为拼音的状态）
 *
 * 状态（汉字）的发射概率
 * 观察序列 - 拼音串
 * emiss_prob = {
 *         word1 : {pinyin11: num11, pinyin12: num12, ...},
 *         word2 : {pinyin21: num21, pinyin22: num22, ...},
 *         ...
 * }
 */
function count_emiss(phrases) {
  const emiss_prob = {};

  // https://www.npmjs.com/package/pinyin/v/3.1.0
  console.log(
    pinyin('ad', {
      // 不启用多音字模式，仅返回每个汉字第一个匹配的拼音
      heteronym: false,
      // 启用分词，以解决多音字问题
      segment: true,
      // 输出拼音格式：含声调，如，pīn yīn
      style: pinyin.STYLE_TONE,
      // 紧凑模式：你好吗 -> [ [nǐ,hǎo,ma], [nǐ,hǎo,má], ... ]
      compact: true
    })
  );

  return emiss_prob;
}

// '''
// 拼音-汉字发射概率：每个拼音对应的汉字以及次数（多音汉字即为拼音的状态）
// ********状态（汉字）的发射概率
// 观察序列 - 拼音串
// emiss_prob = {
//         word1 : {pinyin11: num11, pinyin12: num12, ...},
//         word2 : {pinyin21: num21, pinyin22: num22, ...},
//         ...
// }
// '''
// def count_emiss(seqs):
//     emiss_prob = {}
//     num = 0
//     len_ = len(seqs)
//     for seq in seqs:
//         # 句子转拼音：含声调，且使用 ü
//         pinyin = pypinyin.lazy_pinyin(seq, style=pypinyin.Style.TONE, v_to_u=True)
//         # 汉字-拼音 发射概率
//         for py, word in zip(pinyin, seq):
//             if py == 'shāng' and word == '的':
//                 print('{} - {}'.format(json.dumps(pinyin, ensure_ascii=False), json.dumps(seq, ensure_ascii=False)))
//             if not emiss_prob.get(word, None):
//                 emiss_prob[word] = {}
//             emiss_prob[word][py] = emiss_prob[word].get(py, 0) + 1

//         num +=1
//         if not num % 10000:
//             print('{}/{}'.format(num, len_))

//     # normalize
//     # log
//     for word in emiss_prob.keys():
//         total = sum(emiss_prob.get(word).values())
//         for key in emiss_prob.get(word):
//             emiss_prob[word][key] = math.log(emiss_prob[word][key] / total)

/** 计算汉字（状态）间转移概率：每个句子中汉字转移概率 */
function count_trans(phrases) {
  const trans_prob = {};

  return trans_prob;
}

// '''
// 计算
// '''
// def count_trans(seqs):
//     trans_prob = {}
//     num = 0
//     len_ = len(seqs)
//     for seq in seqs:
//         seq = [w for w in seq]
//         seq.insert(0, 'BOS')
//         seq.append('EOS')

//         for index, post in enumerate(seq):
//             if index:
//                 pre = seq[index - 1]
//                 if not trans_prob.get(post, None):
//                     trans_prob[post] = {}
//                 trans_prob[post][pre] = trans_prob[post].get(pre, 0) + 1

//         num +=1
//         if not num % 10000:
//             print('{}/{}'.format(num, len_))

//     # normalize
//     for word in trans_prob.keys():
//         total = sum(trans_prob.get(word).values())
//         for pre in trans_prob.get(word).keys():
//             trans_prob[word][pre] = math.log(trans_prob[word].get(pre) / total)
