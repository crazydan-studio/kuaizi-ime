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
-- 字与其拼音数据
CREATE TABLE
    IF NOT EXISTS meta_word_with_pinyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        word_id_ INTEGER NOT NULL,
        -- 拼音字母组合 id
        chars_id_ INTEGER NOT NULL,
        UNIQUE (word_id_, chars_id_)
    );

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
    word_chars: {},
    init_prob: {},
    emiss_prob: {},
    trans_prob: {}
  };

  const pred_dict_words = {};
  const collect_pred_dict_words = (word_id_) => {
    pred_dict_words[word_id_] = true;
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

      collect_pred_dict_words(word_id_);
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

    collect_pred_dict_words(word_id_);

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

    collect_pred_dict_words(word_id_);

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

        collect_pred_dict_words(prev_word_id_);
      }
    });
  });

  // 收集字与其拼音信息
  Object.keys(wordDict.pinyin_word).forEach((code) => {
    const splits = code.split(/_/g);
    const word_id_ = splits[0];
    const chars_id_ = splits[1];

    if (!pred_dict_words[word_id_]) {
      return;
    }

    predDict.word_chars[code] = {
      word_id_,
      chars_id_
    };
  });

  // =======================================================
  await asyncForEach(
    [
      {
        table: 'meta_word_with_pinyin',
        prop: 'word_chars',
        getCode: (row) => `${row.word_id_}_${row.chars_id_}`
      },
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
export async function predict(predDictDB, wordDictDB, pinyinCharsArray) {
  const pinyin_chars_and_words = {};
  const pinyin_chars = {};
  const pinyin_words = {};

  // ====================================================
  (
    await wordDictDB.all(
      `select * from pinyin_word where spell_chars_ in (${
        "'" + pinyinCharsArray.join("', '") + "'"
      })`
    )
  ).forEach((row) => {
    const { word_, word_id_, spell_chars_, spell_chars_id_ } = row;

    pinyin_chars[spell_chars_] = spell_chars_id_;
    pinyin_words[word_id_] = word_;

    pinyin_chars_and_words[spell_chars_id_] =
      pinyin_chars_and_words[spell_chars_id_] || [];
    pinyin_chars_and_words[spell_chars_id_].push(word_id_);
  });

  // =====================================================
  const total = pinyinCharsArray.length;
  const last_index = total - 1;

  const first_pinyin_chars_id = pinyin_chars[pinyinCharsArray[0]];
  const pinyin_chars_ids = pinyinCharsArray.map((ch) => pinyin_chars[ch]);
  const unique_pinyin_chars_ids = Array.from(new Set(pinyin_chars_ids));
  const joined_pinyin_chars_ids = unique_pinyin_chars_ids.join(', ');

  const init_prob = {};
  const emiss_prob = {};
  const trans_prob = {};

  await asyncForEach(
    [
      {
        // Note：只有首拼音的字才需要取初始概率矩阵
        select: `select distinct s_.*
        from
          meta_init_prob s_
          inner join meta_word_with_pinyin t_
            on t_.word_id_ = s_.word_id_
        where
          t_.chars_id_ = ${first_pinyin_chars_id}`,
        convert: ({ word_id_, value_ }) => {
          init_prob[word_id_] = value_;
        }
      },
      {
        select: `select distinct s_.*
        from
          meta_emiss_prob s_
        where
          s_.chars_id_ in (${joined_pinyin_chars_ids})`,
        convert: ({ word_id_, chars_id_, value_ }) => {
          emiss_prob[word_id_] = emiss_prob[word_id_] || {};
          emiss_prob[word_id_][chars_id_] = value_;
        }
      },
      {
        select:
          'with recursive\n' +
          (() => {
            const chars_ids = [-1, ...unique_pinyin_chars_ids, -1];
            const word_tables = [];
            const union_sqls = [];
            for (let i = 1; i < chars_ids.length; i++) {
              const prev_chars_id = chars_ids[i - 1];
              const curr_chars_id = chars_ids[i];

              if (curr_chars_id != -1) {
                word_tables.push(`
                  word_ids_${curr_chars_id}(word_id_) as (
                    select
                      word_id_
                    from
                      meta_word_with_pinyin
                    where
                      chars_id_ = ${curr_chars_id}
                  )
                `);
              }

              if (prev_chars_id == -1) {
                union_sqls.push(`
                  select
                    -1 as prev_word_id_
                    , curr_.word_id_ as curr_word_id_
                  from
                    word_ids_${curr_chars_id} curr_
                `);
              } else if (curr_chars_id == -1) {
                union_sqls.push(`
                  select
                    prev_.word_id_ as prev_word_id_
                    , -1 as curr_word_id_
                  from
                    word_ids_${prev_chars_id} prev_
                `);
              } else {
                union_sqls.push(`
                  select
                    prev_.word_id_ as prev_word_id_
                    , curr_.word_id_ as curr_word_id_
                  from
                    word_ids_${prev_chars_id} prev_
                      , word_ids_${curr_chars_id} curr_
                `);
              }
            }

            return (
              word_tables.join(', ') +
              (', word_ids(prev_word_id_, curr_word_id_) as (' +
                union_sqls.join(' union ') +
                ')')
            );
          })() +
          `
        select distinct s_.*
        from
          meta_trans_prob s_
          , word_ids t_
        where
          s_.word_id_ = t_.curr_word_id_
          and s_.prev_word_id_ = t_.prev_word_id_
        `,
        convert: ({ word_id_, prev_word_id_, value_ }) => {
          trans_prob[word_id_] = trans_prob[word_id_] || {};
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
  // 用于log平滑时所取的最小值，用于代替0
  const min_f = -3.14e100;
  // pos 是目前节点的位置，word 为当前汉字即当前状态，
  // probability 为从 pre_word 上一汉字即上一状态转移到目前状态的概率
  // viterbi[pos][word] = (probability, pre_word)
  const viterbi = [];

  for (let prev_index = -1; prev_index < last_index; prev_index++) {
    const current_index = prev_index + 1;
    const current_chars_id = pinyin_chars_ids[current_index];
    const current_word_ids = pinyin_chars_and_words[current_chars_id];

    // Note：首拼音的前序字设为 -1
    const prev_chars_id = pinyin_chars_ids[prev_index];
    const prev_word_ids = pinyin_chars_and_words[prev_chars_id] || [-1];

    const current_word_viterbi = (viterbi[current_index] =
      viterbi[current_index] || {});

    // 遍历 pinyin_char_and_words，找出所有可能与当前拼音相符的汉字 s，
    // 利用动态规划算法从前往后，推出每个拼音汉字状态的概率 viterbi[i+1][s]
    current_word_ids.forEach((current_word_id) => {
      current_word_viterbi[current_word_id] = prev_word_ids.reduce(
        (acc, prev_word_id) => {
          let probability = 0;

          // 首拼音的初始概率为 单字的使用概率
          if (current_index == 0) {
            probability += get(init_prob, current_word_id, min_f);
          } else {
            probability += viterbi[prev_index][prev_word_id][0];
          }

          probability +=
            get(get(emiss_prob, current_word_id, {}), current_chars_id, min_f) +
            get(get(trans_prob, current_word_id, {}), prev_word_id, min_f);

          // 加上末尾字的转移概率
          if (current_index == last_index) {
            probability += get(get(trans_prob, -1, {}), current_word_id, min_f);
          }

          return !acc || acc[0] < probability
            ? [probability, prev_word_id]
            : acc;
        },
        null
      );
    });
  }

  // 对串进行回溯即可得对应拼音的汉字
  const words = [];
  words[last_index] = Object.keys(viterbi[last_index])
    // Note：取概率最大前 N 各末尾汉字
    .map((word_id) => {
      const probability = viterbi[last_index][word_id][0];
      return [probability, word_id];
    })
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5);

  // 结构: words[n] = [[probability, s], ...]
  for (let n = last_index - 1; n > -1; n--) {
    words[n] = words[n + 1].map((pair) => viterbi[n + 1][pair[1]] || [0, -1]);
  }

  // 结构: words[n] = [sum probability, [w1, w2, ..]]
  return words.reduce(
    (acc, w) => {
      return w.map((pair, i) => {
        // [sum probability, [w1, w2, ..]]
        const word = pinyin_words[pair[1]];
        const total = acc[i][0];

        return [total + pair[0], [...acc[i][1], word]];
      });
    },
    words[0].map(() => [0, []])
  );
}

function get(obj, key, defaultValue) {
  if (typeof obj[key] == 'undefined') {
    return defaultValue;
  }
  return obj[key];
}
