import { asyncForEach } from '#utils/utils.mjs';
import { saveToDB, removeFromDB, execSQL } from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

// 查看表上的索引: PRAGMA index_list('MyTable');
// 查看索引的列: PRAGMA index_info('MyIndex');

// 除主键外，唯一性约束、外键约束、索引等均在 IME 客户端初始化时设置，
// 从而降低 App 的打包大小，其相关的数据准确性由原始字典库保证。
// Note: 在 IME 客户端，对于只读不写的表，其外键约束也可以去掉，但需添加索引

/*
-- 查询繁/简体
select
  w_.id_,
  w_.word_,
  w_.spell_,
  w_.traditional_,
  w_.variant_
from
  pinyin_word w_
where
  w_.variant_ is not null
order by
  w_.spell_
;
*/

/** 同步字读音信息 */
export async function syncSpells(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  -- 不含声调的拼音字母组合
  create table
    if not exists meta_pinyin_chars (
      id_ integer not null primary key,
      value_ text not null
      -- , unique (value_)
    );
  -- 含声调的拼音：可根据 id_ 大小排序
  create table
    if not exists meta_pinyin (
      id_ integer not null primary key,
      value_ text not null,
      -- 拼音字母组合 id
      chars_id_ integer not null
      -- , unique (value_),
      -- foreign key (chars_id_) references meta_pinyin_chars (id_)
    );
`
  );

  await syncTableData(imeDB, rawDB, ['meta_pinyin_chars', 'meta_pinyin']);
}

/** 同步字信息 */
export async function syncWords(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  -- Note：索引放在输入法初始化时创建，以降低索引造成的字典文件过大
  create table
    if not exists meta_word_radical (
      id_ integer not null primary key,
      value_ text not null,
      stroke_count_ integer default 0
      -- , unique (value_)
    );

  -- --------------------------------------------------------------
  create table
    if not exists meta_word (
      id_ integer not null primary key,
      value_ text not null,
      -- 笔画顺序：1 - 横，2 - 竖，3 - 撇，4 - 捺，5 - 折
      stroke_order_ text default '',
      -- 是否为繁体字
      traditional_ integer default 0,
      -- 部首 id
      radical_id_ integer default null,
      -- 字使用权重
      used_weight_ integer default 0
      -- , unique (value_),
      -- foreign key (radical_id_) references meta_word_radical (id_)
    );
  create table
    if not exists meta_word_with_pinyin (
      id_ integer not null primary key,
      -- 字 id
      word_id_ integer not null,
      -- 拼音 id
      spell_id_ integer not null,
      -- 按拼音分组计算的字形权重
      glyph_weight_ integer default 0,
      -- 当前拼音字的繁/简字的 id（对应 meta_word 表的 id_）
      variant_id_ integer default null
      -- , unique (word_id_, spell_id_),
      -- foreign key (word_id_) references meta_word (id_),
      -- foreign key (spell_id_) references meta_pinyin (id_)
    );

  -- --------------------------------------------------------------
  -- 字及其拼音
  create view
    if not exists pinyin_word (
      id_,
      word_,
      word_id_,
      spell_,
      spell_id_,
      spell_chars_id_,
      used_weight_,
      glyph_weight_,
      traditional_,
      radical_,
      radical_stroke_count_,
      variant_,
      variant_id_
    ) as
  select
    lnk_.id_,
    word_.value_,
    word_.id_,
    spell_.value_,
    spell_.id_,
    spell_.chars_id_,
    word_.used_weight_,
    lnk_.glyph_weight_,
    word_.traditional_,
    radical_.value_,
    radical_.stroke_count_,
    var_.value_,
    lnk_.variant_id_
  from
    meta_word_with_pinyin lnk_
    --
    inner join meta_word word_ on word_.id_ = lnk_.word_id_
    inner join meta_pinyin spell_ on spell_.id_ = lnk_.spell_id_
    inner join meta_word_radical radical_ on radical_.id_ = word_.radical_id_
    --
    left join meta_word var_ on var_.id_ = lnk_.variant_id_;
`
  );

  await syncTableData(imeDB, rawDB, [
    'meta_word_radical',
    'meta_word',
    'meta_word_with_pinyin'
  ]);

  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  const pinyins = {};
  (await imeDB.all(`select * from meta_pinyin`)).forEach((row) => {
    pinyins[row.id_] = row.value_;
  });
  const words = {};
  (await imeDB.all(`select * from meta_word`)).forEach((row) => {
    words[row.id_] = row;
  });
  const getWord = (id) => words[id].value_;

  // 在 meta_word_with_pinyin 中记录各个拼音字的繁/简形式
  const pinyinWordMetas = {};
  (await imeDB.all(`select * from meta_word_with_pinyin`)).forEach((row) => {
    pinyinWordMetas[row.word_id_] ||= [];
    pinyinWordMetas[row.word_id_].push(row);
  });

  const variantWords = {};
  (
    await rawDB.all(
      `
      select
        source_id_, target_id_, 0 as traditional_
      from link_word_with_simple_word
      union
      select
        source_id_, target_id_, 1 as traditional_
      from link_word_with_traditional_word
      `
    )
  ).forEach((row) => {
    if ((pinyinWordMetas[row.source_id_] || []).length == 0) {
      console.log(
        `字 ${getWord(row.source_id_)}:${row.source_id_} 没有拼音信息`
      );
      return;
    }
    if ((pinyinWordMetas[row.target_id_] || []).length == 0) {
      console.log(
        `字 ${getWord(row.target_id_)}:${row.target_id_} 没有拼音信息`
      );
      return;
    }

    const variant = variantWords[row.source_id_];
    if (variant) {
      console.log(
        `字 ${getWord(row.source_id_)}:${
          row.source_id_
        } 存在多个繁/简体：${getWord(row.target_id_)}:${row.target_id_}:${
          row.traditional_
        }, ${getWord(variant.target_id_)}:${variant.target_id_}:${
          variant.traditional_
        }`
      );
    } else if (row.source_id_ == row.target_id_) {
      console.log(
        `繁/简字同体：${getWord(row.source_id_)}:${
          row.source_id_
        } <=> ${getWord(row.target_id_)}:${row.target_id_}`
      );
    } else {
      variantWords[row.source_id_] = row;
    }
  });

  const wordMetaData = {};
  Object.keys(variantWords).forEach((source_id_) => {
    const variant = variantWords[source_id_];
    const target_id_ = variant.target_id_;

    const sources = pinyinWordMetas[source_id_];
    const targets = pinyinWordMetas[target_id_];

    sources.forEach((source) => {
      const existed =
        targets.filter((target) => target.spell_id_ == source.spell_id_)
          .length > 0;

      if (!existed) {
        console.log(
          `拼音字 ${source.id_}:${getWord(source.word_id_)}:${
            pinyins[source.spell_id_]
          } 没有相同读音的繁/简体：${getWord(target_id_)}:${targets
            .map((t) => pinyins[t.spell_id_])
            .join(',')}`
        );
        return;
      }

      wordMetaData[source.id_] = { ...source, variant_id_: target_id_ };
      wordMetaData[source.id_].__exist__ = source;
    });
  });

  await saveToDB(imeDB, 'meta_word_with_pinyin', wordMetaData);
  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
}

/** 同步词组信息
 *  @deprecated 使用单独的词典库
 */
export async function syncPhrases(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  -- Note：索引放在输入法初始化时创建，以降低索引造成的字典文件过大
  create table
    if not exists meta_phrase (
      id_ integer not null primary key,
      -- 按使用频率等排序的权重
      weight_ integer default 0
    );

  create table
    if not exists meta_phrase_with_pinyin_word (
      id_ integer not null primary key,
      -- 短语 id
      phrase_id_ integer not null,
      -- 字及其拼音关联表 meta_word_with_pinyin 的 id
      word_id_ integer not null,
      -- 字在短语中的序号
      word_index_ integer not null,
      unique (
          phrase_id_,
          word_id_,
          word_index_
      ),
      foreign key (phrase_id_) references meta_phrase (id_),
      foreign key (word_id_) references meta_word_with_pinyin (id_)
    );

  -- --------------------------------------------------------------
  create view
    if not exists link_phrase_with_pinyin_word (
      id_,
      source_id_,
      target_id_,
      target_spell_chars_id_,
      target_index_
    ) as
  select
    meta_.id_,
    meta_.phrase_id_,
    meta_.word_id_,
    spell_.chars_id_,
    meta_.word_index_
  from
    meta_phrase_with_pinyin_word meta_
    --
    left join meta_word_with_pinyin word_ on word_.id_ = meta_.word_id_
    left join meta_pinyin spell_ on spell_.id_ = word_.spell_id_;

  -- --------------------------------------------------------------
  -- 短语及其拼音
  create view
    if not exists pinyin_phrase (
      id_,
      weight_,
      source_id_,
      target_id_,
      target_index_,
      target_spell_chars_id_
    ) as
  select
    lnk_.id_,
    phrase_.weight_,
    lnk_.phrase_id_,
    lnk_.word_id_,
    lnk_.word_index_,
    spell_.chars_id_
  from
    meta_phrase phrase_
    --
    inner join meta_phrase_with_pinyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
    --
    left join meta_word_with_pinyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
    left join meta_pinyin spell_ on spell_.id_ = word_lnk_.spell_id_;
`
  );

  // Note：仅同步有权重的短语
  await syncTableData(imeDB, rawDB, [
    {
      name: 'meta_phrase',
      select: 'select * from meta_phrase where weight_ > 0'
    },
    {
      name: 'meta_phrase_with_pinyin_word',
      select: `
    select
      *
    from
      meta_phrase_with_pinyin_word
    where
      phrase_id_ in (
        select id_ from meta_phrase where weight_ > 0
      )
    `
    }
  ]);
}

/** 同步表情符号信息 */
export async function syncEmojis(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  create table
    if not exists meta_emoji_group (
      id_ integer not null primary key,
      value_ text not null
      -- , unique (value_)
    );

  create table
    if not exists meta_emoji (
      id_ integer not null primary key,
      value_ text not null,
      group_id_ interget not null,
      -- 表情关键字中的字 id（meta_word 中的 id）数组列表：二维 json 数组形式
      keyword_ids_list_ text not null
      -- , unique (value_),
      -- foreign key (group_id_) references meta_emoji_group (id_)
    );
`
  );

  await syncTableData(imeDB, rawDB, ['meta_emoji_group', 'meta_emoji']);
}

async function syncTableData(imeDB, rawDB, tables) {
  await asyncForEach(tables, async (tableInfo) => {
    const table = typeof tableInfo === 'string' ? tableInfo : tableInfo.name;
    const columnsInImeDB = [];
    const primaryKeysInImeDB = [];

    (await imeDB.all(`select name,pk from pragma_table_info('${table}');`)).map(
      (row) => {
        columnsInImeDB.push(row.name);
        if (row.pk > 0) {
          primaryKeysInImeDB.push(row.name);
        }
      }
    );

    const getId = (row) => {
      return primaryKeysInImeDB.map((key) => row[key]).join(':');
    };

    const dataInRawDB = {};
    (
      await rawDB.all(
        typeof tableInfo === 'string'
          ? `select * from ${table}`
          : tableInfo.select
      )
    ).forEach((row) => {
      const id = getId(row);

      const data = (dataInRawDB[id] = {});
      columnsInImeDB.forEach((column) => {
        data[column] = row[column];
      });
    });

    const dataInImeDB = {};
    const missingDataInImeDB = [];
    (await imeDB.all(`select * from ${table}`)).forEach((row) => {
      const id = getId(row);
      const exist = dataInRawDB[id];

      if (exist) {
        // 待更新
        dataInImeDB[id] = {
          ...row,
          __exist__: exist
        };

        // Note: 在原始数据中仅保留待新增的
        delete dataInRawDB[id];
      } else {
        // 待删除
        missingDataInImeDB.push(primaryKeysInImeDB.length === 0 ? id : row);
      }
    });

    // 添加新数据
    await saveToDB(imeDB, table, dataInRawDB, false, primaryKeysInImeDB);
    // 更新已存在数据
    await saveToDB(imeDB, table, dataInImeDB, false, primaryKeysInImeDB);

    // 删除多余数据
    await removeFromDB(imeDB, table, missingDataInImeDB, primaryKeysInImeDB);
  });
}
