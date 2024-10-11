import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '#utils/sqlite.mjs';
import { countTrans } from './trans/trans.mjs';

export {
  openDB as open,
  closeDB as close,
  attachDB as attach,
  execSQL as exec
} from '#utils/sqlite.mjs';

// 查看表上的索引: PRAGMA index_list('MyTable');
// 查看索引的列: PRAGMA index_info('MyIndex');
// 基于HMM的拼音输入法: https://zhuanlan.zhihu.com/p/508599305

/** 初始化词典库的表结构 */
export async function init(db) {
  await execSQL(
    db,
    `
-- Note：采用联合主键，以降低数据库文件大小

-- 字与其拼音数据：基于性能考虑而加的表。
-- 在 IME 中可以仅包含其他表数据，
-- 而在 IME 初始化时再从字典库中创建并初始化该表
CREATE TABLE
    IF NOT EXISTS meta_word_with_pinyin (
        -- 拼音字 id
        -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
        word_id_ INTEGER NOT NULL,

        -- 拼音字母组合 id
        -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 target_chars_id_
        chars_id_ INTEGER NOT NULL,

        PRIMARY KEY (word_id_, chars_id_)
    );

-- 汉字间转移概率矩阵：当前字与前一个字的关联次数（概率在应用侧计算）
CREATE TABLE
    IF NOT EXISTS meta_trans_prob (
        -- 出现次数
        -- Note：当 word_id_ == -1 且 prev_word_id_ == -2 时，
        --       其代表训练数据的句子总数，用于计算 句首字出现频率；
        --       当 word_id_ == -1 且 prev_word_id_ != -1 时，
        --       其代表末尾字出现次数；
        --       当 word_id_ != -1 且 prev_word_id_ == -1 时，
        --       其代表句首字出现次数；
        --       当 word_id_ != -1 且 prev_word_id_ == -2 时，
        --       其代表当前拼音字的转移总数；
        --       当 word_id_ != -1 且 prev_word_id_ != -1 时，
        --       其代表前序拼音字的出现次数；
        value_ INTEGER NOT NULL,

        -- 当前拼音字 id: EOS 用 -1 代替（句尾字）
        -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
        word_id_ INTEGER NOT NULL,

        -- 前序拼音字 id: BOS 用 -1 代替（句首字），__total__ 用 -2 代替
        -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
        prev_word_id_ INTEGER NOT NULL,

        PRIMARY KEY (word_id_, prev_word_id_)
    );
    `
  );
}

/** 根据 HMM 参数创建词典库 */
export async function updateData(phraseDictDB, wordDictDB, hmmParams) {
  await init(phraseDictDB);

  // =======================================================
  const wordDict = {
    pinyin_chars: {},
    pinyin_word: { BOS: -1, EOS: -1, __total__: -2 }
  };
  await asyncForEach(
    [
      {
        table: 'meta_pinyin',
        prop: 'pinyin_chars',
        fields: 'chars_id_ as id_, value_'
      },
      {
        table: 'pinyin_word',
        prop: 'pinyin_word',
        fields: "id_, (word_ || ':' || spell_) as value_"
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
  const single_pinyin_words = {};
  const correct_single_pinyin_word = (word) => {
    if (wordDict.pinyin_word[word]) {
      return word;
    }

    const splits = word.split(':');
    const w = splits[0];

    if (single_pinyin_words[w] === true || !single_pinyin_words[w]) {
      return word;
    } else {
      return `${w}:${single_pinyin_words[w]}`;
    }
  };

  Object.keys(wordDict.pinyin_word).forEach((key) => {
    const splits = key.split(':');
    const word = splits[0];
    const pinyin = splits[1];

    if (word && pinyin) {
      if (single_pinyin_words[word]) {
        single_pinyin_words[word] = true; // 多音字
      } else {
        single_pinyin_words[word] = pinyin;
      }
    }
  });

  // =======================================================
  const predDict = {
    word_chars: {},
    trans_prob: {}
  };

  const phrase_dict_words = {};
  const collect_phrase_dict_words = (word_id_, word_pinyin_) => {
    if ([-1, -2].includes(word_id_)) {
      return;
    }
    phrase_dict_words[word_id_] = wordDict.pinyin_chars[word_pinyin_];
  };

  // {'<word>': {'<prev word>': 0.11, ...}, ...}
  // word 为字符串组合 字:拼音
  Object.keys(hmmParams.trans_prob).forEach((word) => {
    const data = hmmParams.trans_prob[word];
    const new_word = correct_single_pinyin_word(word);

    const word_id_ = wordDict.pinyin_word[new_word];
    if (!word_id_) {
      console.log('汉字间转移概率矩阵中的当前字不存在：', new_word);
      return;
    }

    // if (new_word != word) {
    //   console.log('修正汉字间转移概率矩阵中的当前字：', word, ' -> ', new_word);
    // }

    const word_pinyin_ = new_word.split(':')[1];
    collect_phrase_dict_words(word_id_, word_pinyin_);

    Object.keys(data).forEach((prev_word) => {
      const value_ = data[prev_word];
      const new_prev_word = correct_single_pinyin_word(prev_word);

      const prev_word_id_ = wordDict.pinyin_word[new_prev_word];
      const code = `${word_id_}_${prev_word_id_}`;

      if (!prev_word_id_) {
        console.log(
          '汉字间转移概率矩阵中的前序字不存在：',
          new_word,
          new_prev_word,
          value_
        );
        return;
      }

      // if (new_prev_word != prev_word) {
      //   console.log(
      //     '修正汉字间转移概率矩阵中的前序字：',
      //     prev_word,
      //     ' -> ',
      //     new_prev_word
      //   );
      // }

      predDict.trans_prob[code] = {
        word_id_,
        prev_word_id_,
        value_
      };

      const prev_word_pinyin_ = new_prev_word.split(':')[1];
      collect_phrase_dict_words(prev_word_id_, prev_word_pinyin_);
    });
  });

  // 收集字与其拼音信息
  Object.keys(phrase_dict_words).forEach((word_id_) => {
    const chars_id_ = phrase_dict_words[word_id_];
    const code = `${word_id_}_${chars_id_}`;

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
        primaryKeys: ['word_id_', 'chars_id_']
      },
      {
        table: 'meta_trans_prob',
        prop: 'trans_prob',
        primaryKeys: ['word_id_', 'prev_word_id_']
      }
    ],
    async ({ table, prop, primaryKeys }) => {
      const data = predDict[prop];
      const missing = [];

      (await phraseDictDB.all(`select * from ${table}`)).forEach((row) => {
        const codeObj = primaryKeys.reduce((acc, key) => {
          acc[key] = row[key];
          return acc;
        }, {});
        const code = primaryKeys.map((k) => row[k]).join('_');

        if (!data[code]) {
          missing.push(codeObj);
        } else {
          data[code].__exist__ = row;
        }
      });

      await saveToDB(phraseDictDB, table, data, true, primaryKeys);
      await removeFromDB(phraseDictDB, table, missing, primaryKeys);
    }
  );
}

/** 保存词组 */
export async function saveUsedPhrase(userDictDB, phrase) {
  const trans_prob = countTrans([
    phrase.map(({ value, spell }) => `${value}:${spell}`)
  ]);

  const predDict = {
    words: { BOS: -1, EOS: -1, __total__: -2 },
    word_chars: {},
    trans_prob: {}
  };

  phrase.forEach(({ id, value, spell, spell_chars_id }) => {
    predDict.word_chars[`${id}_${spell_chars_id}`] = {
      word_id_: id,
      chars_id_: spell_chars_id
    };

    predDict.words[`${value}:${spell}`] = id;
  });

  Object.keys(trans_prob).forEach((word) => {
    const data = trans_prob[word];
    const word_id_ = predDict.words[word];

    Object.keys(data).forEach((prev_word) => {
      const value_ = data[prev_word];
      const prev_word_id_ = predDict.words[prev_word];
      const code = `${word_id_}_${prev_word_id_}`;

      predDict.trans_prob[code] = {
        word_id_,
        prev_word_id_,
        value_
      };
    });
  });

  await asyncForEach(
    [
      {
        table: 'meta_word_with_pinyin',
        prop: 'word_chars',
        primaryKeys: ['word_id_', 'chars_id_'],
        update: () => {}
      },
      {
        table: 'meta_trans_prob',
        prop: 'trans_prob',
        primaryKeys: ['word_id_', 'prev_word_id_'],
        update: (data, row) => {
          data.value_ += row.value_;
        }
      }
    ],
    async ({ table, prop, primaryKeys, update }) => {
      const data = predDict[prop];

      (await userDictDB.all(`select * from ${table}`)).forEach((row) => {
        const code = primaryKeys.map((k) => row[k]).join('_');

        if (data[code]) {
          data[code].__exist__ = row;
          update(data[code], row);
        }
      });

      await saveToDB(userDictDB, table, data, true, primaryKeys);
    }
  );
}

/** 词组预测 */
export async function predict(phraseDictDB, userDictDB, pinyinCharsArray) {
  const pinyin_chars_and_words = {};
  const pinyin_chars = {};
  const pinyin_words = {};

  // ====================================================
  (
    await phraseDictDB.all(
      `select
          distinct id_, word_, spell_, spell_chars_, spell_chars_id_
       from pinyin_word
       where spell_chars_ in (${"'" + pinyinCharsArray.join("', '") + "'"})
       order by weight_ desc, glyph_weight_ desc, spell_id_ asc`
    )
  ).forEach((row) => {
    const { id_, word_, spell_, spell_chars_, spell_chars_id_ } = row;

    pinyin_chars[spell_chars_] = spell_chars_id_;
    pinyin_words[id_] = {
      id: id_,
      value: word_,
      spell: spell_,
      spell_chars_id: spell_chars_id_,
      get_candidates: () => {
        return pinyin_chars_and_words[spell_chars_id_].map(
          (id) => pinyin_words[id]
        );
      }
    };

    pinyin_chars_and_words[spell_chars_id_] =
      pinyin_chars_and_words[spell_chars_id_] || [];
    pinyin_chars_and_words[spell_chars_id_].push(id_);
  });

  // =====================================================
  const total = pinyinCharsArray.length;
  const last_index = total - 1;

  const pinyin_chars_ids = pinyinCharsArray.map((ch) => pinyin_chars[ch]);
  const unique_pinyin_chars_ids = Array.from(new Set(pinyin_chars_ids));

  const trans_prob = {};

  await asyncForEach(
    [
      {
        select:
          // https://www.sqlite.org/lang_with.html
          'with recursive\n' +
          (() => {
            // Note：确保表唯一
            const word_tables = unique_pinyin_chars_ids
              .map(
                (id) => `
              word_ids_${id}(word_id_) as (
                select
                  word_id_
                from
                  meta_word_with_pinyin
                where
                  chars_id_ = ${id}
              )
            `
              )
              .concat('word_ids_01(word_id_) as (values(-1))');

            const union_sqls = [];
            // Note：确保前后序准确
            const union_codes = {};
            // 01 对应表 word_ids_01
            const chars_ids = ['01', ...pinyin_chars_ids, '01'];

            for (let i = 1; i < chars_ids.length; i++) {
              const prev_chars_id = chars_ids[i - 1];
              const curr_chars_id = chars_ids[i];

              const union_code = `${prev_chars_id}_${curr_chars_id}`;
              if (union_codes[union_code]) {
                continue;
              }
              union_codes[union_code] = true;

              union_sqls.push(`
                  select
                    prev_.word_id_ as prev_word_id_
                    , curr_.word_id_ as curr_word_id_
                  from
                    word_ids_${prev_chars_id} prev_
                      , word_ids_${curr_chars_id} curr_
                `);
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
          and (
            s_.prev_word_id_ = t_.prev_word_id_
            -- 当前拼音字都包含 __total__ 列
            or s_.prev_word_id_ = -2
          )
        `,
        convert: ({ word_id_, prev_word_id_, value_ }, base) => {
          trans_prob[word_id_] = trans_prob[word_id_] || {};

          trans_prob[word_id_][prev_word_id_] =
            (trans_prob[word_id_][prev_word_id_] || 0) + value_ + (base || 0);
        }
      }
    ],
    async ({ select, convert }) => {
      (await phraseDictDB.all(select)).forEach((row) => {
        convert(row);
      });

      (await userDictDB.all(select)).forEach((row) => {
        convert(row, 1000);
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

  // 训练数据的句子总数: word_id_ == -1 且 prev_word_id_ == -2
  const base_phrase_size = trans_prob_get(trans_prob, -1, -2, 0);

  for (let prev_index = -1; prev_index < last_index; prev_index++) {
    const current_index = prev_index + 1;
    const current_chars_id = pinyin_chars_ids[current_index];
    const current_word_ids = pinyin_chars_and_words[current_chars_id];

    // Note：句首字的前序字设为 -1
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

          // 句首字的初始概率 = math.log(句首字出现次数 / 训练数据的句子总数)
          if (current_index == 0) {
            probability += calc_prob(
              // 句首字的出现次数
              trans_prob_get(trans_prob, current_word_id, -1, 0),
              base_phrase_size,
              min_f
            );
          } else {
            probability += viterbi[prev_index][prev_word_id][0];
          }

          probability += calc_prob(
            // 前序拼音字的出现次数
            trans_prob_get(trans_prob, current_word_id, prev_word_id, 0),
            // 当前拼音字的转移总数
            trans_prob_get(trans_prob, current_word_id, -2, 0),
            min_f
          );

          // 加上末尾字的转移概率
          if (current_index == last_index) {
            probability += calc_prob(
              trans_prob_get(trans_prob, -1, current_word_id, 0),
              base_phrase_size,
              min_f
            );
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

function trans_prob_get(trans_prob, current_word_id, prev_word_id) {
  return get(get(trans_prob, current_word_id, {}), prev_word_id, 0);
}

function calc_prob(count, total, min) {
  return count == 0 || total == 0 ? min : Math.log(count / total);
}
