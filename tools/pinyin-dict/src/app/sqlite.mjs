import { asyncForEach } from '#utils/utils.mjs';
import { saveToDB, execSQL } from '#utils/sqlite.mjs';
import { countTrans } from '#generate/sqlite/phrase/hmm/utils.mjs';

export {
  openDB as open,
  closeDB as close,
  attachDB as attach,
  execSQL as exec
} from '#utils/sqlite.mjs';

// 用户词组数据需加上基础权重
const user_phrase_base_weight = 500;

// 查看表上的索引：PRAGMA index_list('MyTable');
// 查看索引的列：PRAGMA index_info('MyIndex');
// 《基于HMM的拼音输入法》：https://zhuanlan.zhihu.com/p/508599305
// 《自制输入法：拼音输入法与 HMM》: https://elliot00.com/posts/input-method-hmm

/** 初始化词典库的表结构 */
export async function init(userDictDB) {
  await execSQL(
    userDictDB,
    `
  -- Note：采用联合主键，以降低数据库文件大小

  -- 汉字出现次数
  create table
    if not exists phrase_word (
      -- 具体读音的字 id
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id_
      word_id_ integer not null,
      -- 拼音字母组合 id: 方便直接按拼音字母组合搜索
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 spell_chars_id_
      spell_chars_id_ integer not null,

      -- 应用字典中短语内的字权重：出现次数
      weight_app_ integer not null,
      -- 用户字典中短语内的字权重：出现次数
      weight_user_ integer not null,

      primary key (word_id_)
    );

  -- 汉字间转移概率矩阵：当前字与前一个字的关联次数（概率在应用侧计算）
  create table
    if not exists phrase_trans_prob (
      -- 当前拼音字 id: EOS 用 -1 代替（句尾字）
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id_
      word_id_ integer not null,
      -- 当前拼音字的拼音字母组合 id: 方便直接按拼音字母组合搜索
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 spell_chars_id_
      word_spell_chars_id_ integer not null,

      -- 前序拼音字 id: BOS 用 -1 代替（句首字），__total__ 用 -2 代替
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id_
      prev_word_id_ integer not null,
      -- 前序拼音字的拼音字母组合 id: 方便直接按拼音字母组合搜索
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 spell_chars_id_
      prev_word_spell_chars_id_ integer not null,

      -- Note：当 word_id_ == -1 且 prev_word_id_ == -2 时，
      --       其代表训练数据的句子总数，用于计算 句首字出现频率；
      --
      --       当 word_id_ == -1 且 prev_word_id_ != -1 时，
      --       其代表末尾字出现次数；
      --
      --       当 word_id_ != -1 且 prev_word_id_ == -1 时，
      --       其代表句首字出现次数；
      --
      --       当 word_id_ != -1 且 prev_word_id_ == -2 时，
      --       其代表当前拼音字的转移总数；
      --
      --       当 word_id_ != -1 且 prev_word_id_ != -1 时，
      --       其代表前序拼音字的出现次数；
      -- 应用字典中字出现的次数
      value_app_ integer not null,
      -- 用户字典中字出现的次数
      value_user_ integer not null,

      primary key (word_id_, prev_word_id_)
    );

  -- 创建临时表，以用于合并应用词典数据
  create table tmp_phrase_word (
    word_id_ integer not null,
    spell_chars_id_ integer not null,
    weight_app_ integer not null,
    weight_user_ integer not null,
    primary key (word_id_)
  );
  create table tmp_phrase_trans_prob (
    word_id_ integer not null,
    word_spell_chars_id_ integer not null,
    prev_word_id_ integer not null,
    prev_word_spell_chars_id_ integer not null,
    value_app_ integer not null,
    value_user_ integer not null,
    primary key (word_id_, prev_word_id_)
  );

  -- 合并应用和用户词典数据
  insert into tmp_phrase_word
    (word_id_, spell_chars_id_, weight_app_, weight_user_)
  select
    word_id_, -3,
    ifnull(app_.weight_, 0) as weight_app_,
    ifnull(user_.weight_user_, 0) as weight_user_
  from phrase.phrase_word app_
    full join phrase_word user_
      using(word_id_)
  ;
  insert into tmp_phrase_trans_prob
    (word_id_, prev_word_id_,
      word_spell_chars_id_, prev_word_spell_chars_id_,
      value_app_, value_user_
    )
  select
    word_id_, prev_word_id_,
    (case
      when word_id_ < 0 then word_id_
      else -3
    end) as word_spell_chars_id_,
    (case
      when prev_word_id_ < 0 then prev_word_id_
      else -3
    end) as prev_word_spell_chars_id_,
    ifnull(app_.value_, 0) as value_app_,
    ifnull(user_.value_user_, 0) as value_user_
  from phrase.phrase_trans_prob app_
    full join phrase_trans_prob user_
      using(word_id_, prev_word_id_)
  ;

  -- 补充拼音字的拼音字母组合 id
  update tmp_phrase_word
    set spell_chars_id_ = (
      select spell_chars_id_
      from link_word_with_pinyin
      where id_ = tmp_phrase_word.word_id_
    )
    where spell_chars_id_ = -3;

  update tmp_phrase_trans_prob
    set word_spell_chars_id_ = (
      select spell_chars_id_
      from link_word_with_pinyin
      where id_ = tmp_phrase_trans_prob.word_id_
    )
    where word_spell_chars_id_ = -3;

  update tmp_phrase_trans_prob
    set prev_word_spell_chars_id_ = (
      select spell_chars_id_
      from link_word_with_pinyin
      where id_ = tmp_phrase_trans_prob.prev_word_id_
    )
    where prev_word_spell_chars_id_ = -3;

  -- 重建表会比对表做数据删除再新增会快点
  drop table phrase_word;
  alter table tmp_phrase_word rename to phrase_word;
  drop table phrase_trans_prob;
  alter table tmp_phrase_trans_prob rename to phrase_trans_prob;

  -- 补充索引
  create index idx_ph_wrd_spell_chars on phrase_word(spell_chars_id_);
  create index idx_ph_trp_spell_chars
    on phrase_trans_prob(word_spell_chars_id_, prev_word_spell_chars_id_);

  -- 空间回收
  vacuum;
`
  );
}

/** 保存词组 */
export async function saveUsedPhrase(userDictDB, phrase) {
  const trans_prob = countTrans([
    phrase.map(({ value, spell }) => `${value}:${spell}`)
  ]);

  const pred_dict = {
    phrases: {},
    word_chars: {},
    pinyin_word: { BOS: -1, EOS: -1, __total__: -2 },
    trans_prob: {}
  };

  phrase.forEach(({ id, value, spell, spell_chars_id }) => {
    const word_code = `${value}:${spell}`;

    pred_dict.pinyin_word[word_code] = id;
    pred_dict.phrases[word_code] = { spell_chars_id };

    const word_chars_code = `${id}`;
    if (!pred_dict.word_chars[word_chars_code]) {
      pred_dict.word_chars[word_chars_code] = {
        word_id_: id,
        spell_chars_id_: spell_chars_id,
        weight_user_: 0
      };
    }
    pred_dict.word_chars[word_chars_code].weight_user_ += 1;
  });

  Object.keys(trans_prob).forEach((word_code) => {
    const probs = trans_prob[word_code];
    const word_id = pred_dict.pinyin_word[word_code];
    const word_spell_chars_id =
      word_id > 0
        ? pred_dict.phrases[word_code].spell_chars_id
        : // 代表 EOS/BOS 的字用其 id 表示拼音字母组合
          word_id;

    Object.keys(probs).forEach((prev_word_code) => {
      const prob_value = probs[prev_word_code];
      const prev_word_id = pred_dict.pinyin_word[prev_word_code];
      const prev_word_spell_chars_id =
        prev_word_id > 0
          ? pred_dict.phrases[prev_word_code].spell_chars_id
          : // 代表 EOS/BOS 的字用其 id 表示拼音字母组合
            prev_word_id;

      const prob_code = `${word_id}:${prev_word_id}`;

      pred_dict.trans_prob[prob_code] = {
        word_id_: word_id,
        word_spell_chars_id_: word_spell_chars_id,
        prev_word_id_: prev_word_id,
        prev_word_spell_chars_id_: prev_word_spell_chars_id,
        value_user_: prob_value
      };
    });
  });

  await asyncForEach(
    [
      {
        table: 'phrase_word',
        prop: 'word_chars',
        primaryKeys: ['word_id_'],
        create: (data) => {
          data.weight_app_ = 0;
        },
        update: (data, row) => {
          // 应用数据不变
          data.weight_app_ = row.weight_app_;
          // 用户数据累加
          data.weight_user_ += row.weight_user_ || 0;
        }
      },
      {
        table: 'phrase_trans_prob',
        prop: 'trans_prob',
        primaryKeys: ['word_id_', 'prev_word_id_'],
        create: (data) => {
          data.value_app_ = 0;
        },
        update: (data, row) => {
          // 应用数据不变
          data.value_app_ = row.value_app_;
          // 用户数据累加
          data.value_user_ += row.value_user_ || 0;
        }
      }
    ],
    async ({ table, prop, primaryKeys, create, update }) => {
      const data = pred_dict[prop];

      (await userDictDB.all(`select * from ${table}`)).forEach((row) => {
        const code = primaryKeys.map((k) => row[k]).join(':');

        if (data[code]) {
          data[code].__exist__ = row;
          update(data[code], row);
        }
      });

      Object.keys(data).forEach((code) => {
        if (!data[code].__exist__) {
          create(data[code]);
        }
      });

      // console.log(table, JSON.stringify(data));
      // console.log();

      await saveToDB(userDictDB, table, data, true, primaryKeys);
    }
  );
}

/** 词组预测 */
export async function predict(userDictDB, pinyinCharsArray) {
  const pinyin_chars_and_words = {};
  const pinyin_chars = {};
  const pinyin_words = {};

  // TODO 修正拼音，并对修正后的预测结果排序，提供词组可选项

  // ====================================================
  (
    await userDictDB.all(`
      select distinct
        py_.id_, py_.word_, py_.spell_, py_.spell_chars_, py_.spell_chars_id_
      from pinyin_word py_
        left join phrase_word ph_
          on ph_.word_id_ = py_.id_
      where
        py_.spell_chars_ in (${"'" + pinyinCharsArray.join("', '") + "'"})
      order by
        ( ph_.weight_app_ + ph_.weight_user_ +
          iif(ph_.weight_user_ > 0, ${user_phrase_base_weight}, 0)
        ) desc,
        py_.used_weight_ desc, py_.glyph_weight_ desc, py_.spell_id_ asc
      `)
  ).forEach((row) => {
    const { id_, word_, spell_, spell_chars_, spell_chars_id_ } = row;

    pinyin_chars[spell_chars_] = spell_chars_id_;
    pinyin_words[id_] = {
      id: id_,
      value: word_,
      spell: spell_,
      spell_chars_id: spell_chars_id_,
      // 延迟获取候选字列表
      get_candidates: () => {
        return pinyin_chars_and_words[spell_chars_id_].map(
          (id) => pinyin_words[id]
        );
      }
    };

    pinyin_chars_and_words[spell_chars_id_] ||= [];
    pinyin_chars_and_words[spell_chars_id_].push(id_);
  });

  // =====================================================
  const pinyin_chars_ids = pinyinCharsArray.map((ch) => pinyin_chars[ch]);

  const trans_prob = {};
  const trans_pinyin_chars_and_words = {};

  const chars_id_pairs = [];
  const chars_ids = [-1, ...pinyin_chars_ids, -1];
  for (let i = 1; i < chars_ids.length; i++) {
    const prev_chars_id = chars_ids[i - 1];
    const curr_chars_id = chars_ids[i];

    chars_id_pairs.push([prev_chars_id, curr_chars_id]);
    // 当前拼音字都包含 __total__ 列，以得到其转移总数
    chars_id_pairs.push([-2, curr_chars_id]);
  }

  await asyncForEach(
    [
      {
        select: `
        select distinct *
        from
          phrase_trans_prob
        where
          (prev_word_spell_chars_id_, word_spell_chars_id_)
          in (${chars_id_pairs
            .map((pair) => `(${pair.join(', ')})`)
            .join(', ')})
        `,
        convert: ({
          word_id_,
          word_spell_chars_id_,
          prev_word_id_,
          value_app_,
          value_user_
        }) => {
          trans_prob[word_id_] ||= {};

          trans_prob[word_id_][prev_word_id_] ||= 0;
          trans_prob[word_id_][prev_word_id_] +=
            value_app_ +
            value_user_ +
            (value_user_ > 0 ? user_phrase_base_weight : 0);

          if (word_spell_chars_id_ >= 0) {
            const words = (trans_pinyin_chars_and_words[
              word_spell_chars_id_
            ] ||= []);

            !words.includes(word_id_) && words.push(word_id_);
          }
        }
      }
    ],
    async ({ select, convert }) => {
      // console.log(select);

      (await userDictDB.all(select)).forEach((row) => {
        convert(row);
      });
    }
  );

  // console.log('trans_prob = ', JSON.stringify(trans_prob));
  // console.log();

  // =====================================================
  // https://github.com/wmhst7/THU_AI_Course_Pinyin
  const total = pinyin_chars_ids.length;
  // 用于 log 平滑时所取的最小值，用于代替 0
  const min_prob = -50;
  // pos 是目前节点的位置，word 为当前汉字即当前状态，
  // probability 为从 pre_word 上一汉字即上一状态转移到目前状态的概率
  // viterbi[pos][word] = (probability, pre_word)
  const viterbi = [];

  // 训练数据的句子总数: word_id_ == -1 且 prev_word_id_ == -2
  const base_phrase_size = trans_prob_get(trans_prob, -1, -2);

  const last_index = total - 1;
  for (let prev_index = -1; prev_index < last_index; prev_index++) {
    const current_index = prev_index + 1;
    const current_pinyin_chars_id = pinyin_chars_ids[current_index];
    const current_word_ids =
      trans_pinyin_chars_and_words[current_pinyin_chars_id] ||
      // 处理未记录的拼音字母组合
      pinyin_chars_and_words[current_pinyin_chars_id];

    // Note：句首字的前序字设为 -1
    const prev_pinyin_chars_id = pinyin_chars_ids[prev_index];
    const prev_word_ids = trans_pinyin_chars_and_words[
      prev_pinyin_chars_id
    ] || [-1];

    const current_word_viterbi = (viterbi[current_index] ||= {});

    // 遍历 current_word_ids 和 prev_word_ids，找出所有可能与当前拼音相符的汉字 s，
    // 利用动态规划算法从前往后，推出每个拼音汉字状态的概率 viterbi[i+1][s]
    current_word_ids.forEach((current_word_id) => {
      current_word_viterbi[current_word_id] = prev_word_ids.reduce(
        (acc, prev_word_id) => {
          let prob = 0;

          // 句首字的初始概率 = math.log(句首字出现次数 / 训练数据的句子总数)
          if (current_index == 0) {
            prob += calc_prob(
              // 句首字的出现次数
              trans_prob_get(trans_prob, current_word_id, -1),
              base_phrase_size,
              min_prob
            );
          } else {
            prob += viterbi[prev_index][prev_word_id][0];
          }

          prob += calc_prob(
            // 前序拼音字的出现次数
            trans_prob_get(trans_prob, current_word_id, prev_word_id),
            // 当前拼音字的转移总数
            trans_prob_get(trans_prob, current_word_id, -2),
            min_prob
          );

          // 加上末尾字的转移概率
          if (current_index == last_index) {
            prob += calc_prob(
              trans_prob_get(trans_prob, -1, current_word_id),
              base_phrase_size,
              min_prob
            );
          }

          return !acc || acc[0] < prob ? [prob, prev_word_id] : acc;
        },
        null
      );
    });
  }

  // console.log('viterbi = ', JSON.stringify(viterbi));
  // console.log();

  // 对串进行回溯即可得对应拼音的汉字
  // 结构: words[n] = [[probability, s], ...]
  const words = [];
  words[last_index] = Object.keys(viterbi[last_index])
    // Note：取概率最大前 N 个末尾汉字
    .map((word_id) => {
      const prob = viterbi[last_index][word_id][0];
      return [prob, word_id];
    })
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5);

  for (let n = last_index - 1; n > -1; n--) {
    words[n] = words[n + 1].map((pair) => viterbi[n + 1][pair[1]]);
  }

  // console.log('viterbi_words = ', JSON.stringify(words));
  // console.log();

  // 结构: [sum probability, [w1, w2, ..]]
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
