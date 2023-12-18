import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '../../../utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '../../../utils/sqlite.mjs';

// 查看表上的索引: PRAGMA index_list('MyTable');
// 查看索引的列: PRAGMA index_info('MyIndex');
// 基于HMM的拼音输入法: https://zhuanlan.zhihu.com/p/508599305

/** 根据 HMM 参数创建预测词库 */
export async function updateData(predDictDB, wordDictDB, hmmParams) {
  await execSQL(
    predDictDB,
    `
-- 初始概率矩阵：单字的使用概率
CREATE TABLE
    IF NOT EXISTS meta_init_prob (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 概率值
        value_ REAL NOT NULL,
        -- 字 id
        word_id_ INTEGER NOT NULL,
        UNIQUE (word_id_)
    );

-- 汉字-拼音发射概率矩阵：字的对应拼音（多音字）的使用概率，概率为 0 的表示单音字
CREATE TABLE
    IF NOT EXISTS meta_emiss_prob (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 概率值
        value_ REAL NOT NULL,
        -- 字 id
        word_id_ INTEGER NOT NULL,
        -- 拼音字母组合 id
        chars_id_ INTEGER NOT NULL,
        UNIQUE (word_id_, chars_id_)
    );

-- 汉字间转移概率矩阵：当前字与前一个字的关联概率
CREATE TABLE
    IF NOT EXISTS meta_trans_prob (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 概率值
        value_ REAL NOT NULL,
        -- 当前字 id: EOS 用 -1 代替
        word_id_ INTEGER NOT NULL,
        -- 前序字 id: BOS 用 -1 代替
        prev_word_id_ INTEGER NOT NULL,
        UNIQUE (word_id_, prev_word_id_)
    );
    `
  );

  // =======================================================
  const wordDict = {
    pinyin_chars: {},
    word: { BOS: -1, EOS: -1 },
    pinyin_word: {}
  };
  await asyncForEach(
    [
      {
        table: 'meta_pinyin_chars',
        prop: 'pinyin_chars',
        fields: 'id_, value_'
      },
      { table: 'meta_word', prop: 'word', fields: 'id_, value_' },
      {
        table: 'link_word_with_pinyin',
        prop: 'pinyin_word',
        fields: "id_, (source_id_ || '_' || target_chars_id_) as value_"
      }
    ],
    async ({ table, fields, prop }) => {
      (await wordDictDB.all(`select ${fields} from ${table}`)).forEach(
        (row) => {
          const { id_, value_ } = row;

          wordDict[prop][value_] = id_;
        }
      );
    }
  );

  // =======================================================
  const predDict = {
    init_prob: {},
    emiss_prob: {},
    trans_prob: {}
  };

  // {'<word>': 0.11, ...}
  Object.keys(hmmParams.init_prob).forEach((word) => {
    const word_id_ = wordDict.word[word];
    const value_ = hmmParams.init_prob[word];

    if (!word_id_) {
      console.log('初始概率矩阵中的字不存在：', word, value_);
    } else {
      predDict.init_prob[word_id_] = {
        word_id_,
        value_
      };
    }
  });

  // {'<word>': {'<pinyin chars>': 0.11, ...}, ...}
  Object.keys(hmmParams.emiss_prob).forEach((word) => {
    const word_id_ = wordDict.word[word];
    const data = hmmParams.emiss_prob[word];

    if (!word_id_) {
      console.log('汉字-拼音发射概率矩阵中的字不存在：', word);
      return;
    }

    Object.keys(data).forEach((chars) => {
      const value_ = data[chars];

      if (chars.indexOf('v') >= 0) {
        chars = chars.replaceAll(/v/g, 'ü');

        if (data[chars]) {
          return;
        }
      }

      const chars_id_ = wordDict.pinyin_chars[chars];
      const code = `${word_id_}_${chars_id_}`;

      if (!chars_id_ || !wordDict.pinyin_word[code]) {
        console.log(
          '汉字-拼音发射概率矩阵中的拼音不存在：',
          word,
          chars,
          value_
        );
      } else {
        predDict.emiss_prob[code] = {
          word_id_,
          chars_id_,
          value_
        };
      }
    });
  });

  // {'<word>': {'<prev word>': 0.11, ...}, ...}
  Object.keys(hmmParams.trans_prob).forEach((word) => {
    const word_id_ = wordDict.word[word];
    const data = hmmParams.trans_prob[word];

    if (!word_id_) {
      console.log('汉字间转移概率矩阵中的当前字不存在：', word);
      return;
    }

    Object.keys(data).forEach((prev_word) => {
      const value_ = data[prev_word];
      const prev_word_id_ = wordDict.word[prev_word];
      const code = `${word_id_}_${prev_word_id_}`;

      if (!prev_word_id_) {
        console.log(
          '汉字间转移概率矩阵中的前序字不存在：',
          word,
          prev_word,
          value_
        );
      } else {
        predDict.trans_prob[code] = {
          word_id_,
          prev_word_id_,
          value_
        };
      }
    });
  });

  // =======================================================
  await asyncForEach(
    [
      {
        table: 'meta_init_prob',
        prop: 'init_prob',
        getCode: (row) => row.word_id_
      },
      {
        table: 'meta_emiss_prob',
        prop: 'emiss_prob',
        getCode: (row) => `${row.word_id_}_${row.chars_id_}`
      },
      {
        table: 'meta_trans_prob',
        prop: 'trans_prob',
        getCode: (row) => `${row.word_id_}_${row.prev_word_id_}`
      }
    ],
    async ({ table, prop, getCode }) => {
      const data = predDict[prop];
      const missing = [];

      (await predDictDB.all(`select * from ${table}`)).forEach((row) => {
        const id_ = row.id_;
        const code = getCode(row);

        if (!data[code]) {
          missing.push(id_);
        } else {
          data[code].id_ = id_;
          data[code].__exist__ = row;
        }
      });

      await saveToDB(predDictDB, table, data);
      await removeFromDB(predDictDB, table, missing);
    }
  );
}

/** 词组预测 */
export async function predict(predDictDB, wordDictDB, pinyinChars) {
  const pinyin_states = {};
  const pinyin_chars = {};
  const pinyin_words = {};

  // ====================================================
  (
    await wordDictDB.all(
      `select * from pinyin_word where spell_chars_ in (${
        "'" + pinyinChars.join("', '") + "'"
      })`
    )
  ).forEach((row) => {
    const { word_, word_id_, spell_chars_, spell_chars_id_ } = row;

    pinyin_chars[spell_chars_] = spell_chars_id_;
    pinyin_words[word_id_] = word_;

    pinyin_states[spell_chars_id_] = pinyin_states[spell_chars_id_] || [];
    pinyin_states[spell_chars_id_].push(word_id_);
  });

  // =====================================================
  const init_prob = {};
  const emiss_prob = {};
  const trans_prob = {};

  const pinyin_word_ids = Object.keys(pinyin_words).join(', ');
  await asyncForEach(
    [
      {
        select: `select * from meta_init_prob where word_id_ in (${pinyin_word_ids})`,
        convert: ({ word_id_, value_ }) => {
          init_prob[word_id_] = value_;
        }
      },
      {
        select: `select * from meta_emiss_prob where word_id_ in (${pinyin_word_ids})`,
        convert: ({ word_id_, chars_id_, value_ }) => {
          emiss_prob[word_id_] = emiss_prob[word_id_] || {};
          emiss_prob[word_id_][chars_id_] = value_;
        }
      },
      {
        select: `select * from meta_trans_prob where word_id_ in (${pinyin_word_ids}) or word_id_ = -1 or prev_word_id_ = -1`,
        convert: ({ word_id_, prev_word_id_, value_ }) => {
          trans_prob[word_id_] = trans_prob[word_id_] || [];
          trans_prob[word_id_][prev_word_id_] = value_;
        }
      }
    ],
    async ({ select, convert }) => {
      (await predDictDB.all(select)).forEach((row) => {
        convert(row);
      });
    }
  );

  // =====================================================
  const length = pinyinChars.length;
  const last = length - 1;
  const seq = pinyinChars.map((ch) => pinyin_chars[ch]);

  // 用于log平滑时所取的最小值，用于代替0
  const min_f = -3.14e100;
  // pos 是目前节点的位置，word 为当前汉字即当前状态，
  // probability 为从 pre_word 上一汉字即上一状态转移到目前状态的概率
  // viterbi[pos][word] = (probability, pre_word)
  const viterbi = [];
  // 针对每个拼音切分，首先根据第一个拼音，
  // 从 pinyin_states 中找出所有可能的汉字s，
  // 然后通过 init_prob 得出初始概率，通过 emiss_prob 得出发射概率，
  // 从而算出 viterbi[0][s]
  pinyin_states[seq[0]].forEach((s) => {
    const probability =
      get(init_prob, s, min_f) +
      get(get(emiss_prob, s, {}), seq[0], min_f) +
      get(get(trans_prob, s, {}), -1, min_f);

    viterbi[0] = viterbi[0] || {};
    viterbi[0][s] = [probability, -1];
  });

  for (let i = 0; i < last; i++) {
    // 遍历 pinyin_states，找出所有可能与当前拼音相符的汉字 s，
    // 利用动态规划算法从前往后，推出每个拼音汉字状态的概率 viterbi[i+1][s]
    pinyin_states[seq[i + 1]].forEach((s) => {
      viterbi[i + 1] = viterbi[i + 1] || {};

      viterbi[i + 1][s] = pinyin_states[seq[i]].reduce((acc, pre) => {
        const probability =
          viterbi[i][pre][0] +
          get(get(emiss_prob, s, {}), seq[i + 1], min_f) +
          get(get(trans_prob, s, {}), pre, min_f);

        return !acc || acc[0] < probability ? [probability, pre] : acc;
      }, null);
    });
  }

  // 取概率最大的串（可从大到小取多个串），即概率最大的 viterbi[n][s]（s为末尾的汉字）
  pinyin_states[seq[last]].forEach((s) => {
    const probability =
      viterbi[last][s][0] + //
      get(get(trans_prob, -1, {}), s, min_f);

    viterbi[last][s] = [probability, viterbi[last][s][1]];
  });

  // 对串进行回溯即可得对应拼音的汉字
  const words = [];
  words[last] = Object.keys(viterbi[last]).reduce((acc, s) => {
    return !acc || acc[0] < viterbi[last][s][0] ? viterbi[last][s] : acc;
  }, null)[1];

  for (let n = last - 1; n > -1; n--) {
    const post = words[n + 1];
    words[n] = viterbi[n + 1][post][1];
  }

  return words.map((id) => pinyin_words[id]);
}

function get(obj, key, defaultValue) {
  if (typeof obj[key] == 'undefined') {
    return defaultValue;
  }
  return obj[key];
}
