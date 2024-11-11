import { asyncForEach } from '#utils/utils.mjs';
import { saveToDB, removeFromDB, execSQL } from '#utils/sqlite.mjs';

export {
  openDB as open,
  closeDB as close,
  attachDB as attach,
  execSQL as exec
} from '#utils/sqlite.mjs';

// 查看表上的索引：PRAGMA index_list('MyTable');
// 查看索引的列：PRAGMA index_info('MyIndex');
// 《基于HMM的拼音输入法》：https://zhuanlan.zhihu.com/p/508599305
// 《自制输入法：拼音输入法与 HMM》: https://elliot00.com/posts/input-method-hmm

/** 初始化词典库的表结构 */
async function init(db) {
  await execSQL(
    db,
    `
  -- Note：采用联合主键，以降低数据库文件大小

  -- 汉字出现次数
  create table
    if not exists phrase_word (
      -- 具体读音的字 id
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
      word_id_ integer not null,

      -- 短语中的字权重：出现次数
      weight_ integer not null,

      primary key (word_id_)
    );

  -- 汉字间转移概率矩阵：当前字与前一个字的关联次数（概率在应用侧计算）
  create table
    if not exists phrase_trans_prob (
      -- 当前拼音字 id: EOS 用 -1 代替（句尾字）
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
      word_id_ integer not null,

      -- 前序拼音字 id: BOS 用 -1 代替（句首字），__total__ 用 -2 代替
      -- Note：其为字典库中 字及其拼音表（link_word_with_pinyin）中的 id
      prev_word_id_ integer not null,

      -- 字出现的次数
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
      value_ integer not null,

      primary key (word_id_, prev_word_id_)
    );
`
  );
}

/** 根据 HMM 参数创建词典库 */
export async function updateData(phraseDictDB, wordDictDB, hmmParams) {
  await init(phraseDictDB);

  // =======================================================
  const word_dict = {
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

          word_dict[prop][value_] = id_;
        }
      );
    }
  );

  // =======================================================
  const pred_dict = {
    word_chars: {},
    trans_prob: {}
  };
  // {'<word:pinyin>': {'<prev word:pinyin>': 123, ...}, ...}
  Object.keys(hmmParams.trans_prob).forEach((word_code) => {
    const probs = hmmParams.trans_prob[word_code];
    const word_id = word_dict.pinyin_word[word_code];

    if (!word_id) {
      console.log('汉字间转移概率矩阵中的当前字不存在：', word_code);
      return;
    }

    Object.keys(probs).forEach((prev_word_code) => {
      const prob_value = probs[prev_word_code];
      const prev_word_id = word_dict.pinyin_word[prev_word_code];

      const prob_code = `${word_id}:${prev_word_id}`;

      if (!prev_word_id) {
        console.log(
          '汉字间转移概率矩阵中的前序字不存在：',
          prob_code,
          prev_word_code,
          prob_value
        );
        return;
      }

      pred_dict.trans_prob[prob_code] = {
        word_id_: word_id,
        prev_word_id_: prev_word_id,
        value_: prob_value
      };
    });
  });

  // 收集字权重信息
  // {'<word:pinyin>': 12, ...}
  Object.keys(hmmParams.word_prob).forEach((word_code) => {
    const weight = hmmParams.word_prob[word_code];
    const word_id = word_dict.pinyin_word[word_code];

    pred_dict.word_chars[word_id] = {
      word_id_: word_id,
      weight_: weight
    };
  });

  // =======================================================
  await asyncForEach(
    [
      {
        table: 'phrase_word',
        prop: 'word_chars',
        primaryKeys: ['word_id_'],
        update: (data, row) => {
          data.weight_ += row.weight_;
        }
      },
      {
        table: 'phrase_trans_prob',
        prop: 'trans_prob',
        primaryKeys: ['word_id_', 'prev_word_id_'],
        update: (data, row) => {
          data.value_ += row.value_;
        }
      }
    ],
    async ({ table, prop, primaryKeys, update }) => {
      const data = pred_dict[prop];

      (await phraseDictDB.all(`select * from ${table}`)).forEach((row) => {
        const code = primaryKeys.map((k) => row[k]).join(':');

        if (data[code]) {
          data[code].__exist__ = row;
          update(data[code], row);
        }
      });

      await saveToDB(phraseDictDB, table, data, true, primaryKeys);
    }
  );
}
