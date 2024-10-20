import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

// 查看表上的索引: PRAGMA index_list('MyTable');
// 查看索引的列: PRAGMA index_info('MyIndex');

/** 同步字读音信息 */
export async function syncSpells(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  -- 不含声调的拼音字母组合
  create table
    if not exists meta_pinyin_chars (
      id_ integer not null primary key,
      value_ text not null,
      unique (value_)
    );
  -- 含声调的拼音：可根据 id_ 大小排序
  create table
    if not exists meta_pinyin (
      id_ integer not null primary key,
      value_ text not null,
      -- 拼音字母组合 id
      chars_id_ integer not null,
      unique (value_),
      foreign key (chars_id_) references meta_pinyin_chars (id_)
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
      stroke_count_ integer default 0,
      unique (value_)
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
      unique (value_),
      foreign key (radical_id_) references meta_word_radical (id_)
    );
  create table
    if not exists meta_word_with_pinyin (
      id_ integer not null primary key,
      -- 字 id
      word_id_ integer not null,
      -- 拼音 id
      spell_id_ integer not null,
      -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
      glyph_weight_ integer default 0,
      -- 按使用频率等排序的权重
      weight_ integer default 0,
      unique (word_id_, spell_id_),
      foreign key (word_id_) references meta_word (id_),
      foreign key (spell_id_) references meta_pinyin (id_)
    );

  -- --------------------------------------------------------------
  create view
    if not exists link_word_with_pinyin (
      id_,
      word_id_,
      spell_id_,
      spell_chars_id_,
      glyph_weight_,
      weight_
    ) as
  select
    meta_.id_,
    meta_.word_id_,
    meta_.spell_id_,
    spell_.chars_id_,
    meta_.glyph_weight_,
    meta_.weight_
  from
    meta_word_with_pinyin meta_
    left join meta_pinyin spell_ on spell_.id_ = meta_.spell_id_;

  -- --------------------------------------------------------------
  create table
    if not exists link_word_with_simple_word (
      id_ integer not null primary key,
      -- 源字 id
      source_id_ integer not null,
      -- 简体字 id
      target_id_ integer not null,
      unique (source_id_, target_id_),
      foreign key (source_id_) references meta_word (id_),
      foreign key (target_id_) references meta_word (id_)
    );
  create table
    if not exists link_word_with_traditional_word (
      id_ integer not null primary key,
      -- 源字 id
      source_id_ integer not null,
      -- 繁体字 id
      target_id_ integer not null,
      unique (source_id_, target_id_),
      foreign key (source_id_) references meta_word (id_),
      foreign key (target_id_) references meta_word (id_)
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
      weight_,
      glyph_weight_,
      stroke_order_,
      traditional_,
      radical_,
      radical_stroke_count_
    ) as
  select
    lnk_.id_,
    word_.value_,
    word_.id_,
    spell_.value_,
    spell_.id_,
    spell_.chars_id_,
    lnk_.weight_,
    lnk_.glyph_weight_,
    word_.stroke_order_,
    word_.traditional_,
    radical_.value_,
    radical_.stroke_count_
  from
    meta_word word_
    --
    inner join meta_word_with_pinyin lnk_ on lnk_.word_id_ = word_.id_
    inner join meta_pinyin spell_ on spell_.id_ = lnk_.spell_id_
    inner join meta_word_radical radical_ on radical_.id_ = word_.radical_id_
    ;

  -- --------------------------------------------------------------
  -- 繁体 -> 简体
  create view
    if not exists simple_word (
      -- 繁体字 id
      id_,
      -- 繁体字
      value_,
      -- 简体字 id
      target_id_,
      -- 简体字
      target_value_
    ) as
  select
    word_.id_,
    word_.value_,
    sw_.id_,
    sw_.value_
  from
    meta_word word_
    --
    inner join link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    inner join meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
  where
    sw_.id_ is not null;

  -- 简体 -> 繁体
  create view
    if not exists traditional_word (
      -- 简体字 id
      id_,
      -- 简体字
      value_,
      -- 繁体字 id
      target_id_,
      -- 繁体字
      target_value_
    ) as
  select
    word_.id_,
    word_.value_,
    tw_.id_,
    tw_.value_
  from
    meta_word word_
    --
    inner join link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    inner join meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
  where
    tw_.id_ is not null;
`
  );

  await syncTableData(imeDB, rawDB, [
    'meta_word_radical',
    'meta_word',
    'meta_word_with_pinyin',
    'link_word_with_simple_word',
    'link_word_with_traditional_word'
  ]);
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
      value_ text not null,
      unique (value_)
    );
  create table
    if not exists meta_emoji (
      id_ integer not null primary key,
      value_ text not null,
      group_id_ interget not null,
      unique (value_),
      foreign key (group_id_) references meta_emoji_group (id_)
    );

  create table
    if not exists link_emoji_with_keyword (
      id_ integer not null primary key,
      -- 表情 id
      source_id_ integer not null,
      -- 表情关键字中的字 id（meta_word 中的 id）列表：json 数组形式
      target_word_ids_ text not null,
      foreign key (source_id_) references meta_emoji (id_)
    );

  -- 分组表情
  create view
    if not exists group_emoji (
      id_,
      value_,
      group_
    ) as
  select
    emo_.id_,
    emo_.value_,
    grp_.value_
  from
    meta_emoji emo_
    --
    inner join meta_emoji_group grp_ on grp_.id_ = emo_.group_id_;

  -- 表情及其关键字
  create view
    if not exists emoji (
      id_,
      value_,
      group_,
      keyword_words_
    ) as
  select
    emo_.id_,
    emo_.value_,
    grp_.value_,
    (select group_concat(word_.value_, '')
      from json_each(lnk_.target_word_ids_) word_id_
        inner join meta_word word_
          on word_.id_ = word_id_.value
    )
  from
    meta_emoji emo_
    --
    inner join link_emoji_with_keyword lnk_ on lnk_.source_id_ = emo_.id_
    inner join meta_emoji_group grp_ on grp_.id_ = emo_.group_id_;
`
  );

  await syncTableData(imeDB, rawDB, [
    'meta_emoji_group',
    'meta_emoji',
    'link_emoji_with_keyword'
  ]);
}

async function syncTableData(imeDB, rawDB, tables) {
  await asyncForEach(tables, async (tableInfo) => {
    const table = typeof tableInfo === 'string' ? tableInfo : tableInfo.name;
    const columnsInImeDB = (
      await imeDB.all(`select name from pragma_table_info('${table}');`)
    ).map((row) => row.name);

    const dataInRawDB = {};
    (
      await rawDB.all(
        typeof tableInfo === 'string'
          ? `select * from ${table}`
          : tableInfo.select
      )
    ).forEach((row) => {
      const id = row.id_;

      const data = (dataInRawDB[id] = {});
      columnsInImeDB.forEach((column) => {
        data[column] = row[column];
      });
    });

    const dataInImeDB = {};
    const missingDataInImeDB = [];
    (await imeDB.all(`select * from ${table}`)).forEach((row) => {
      const id = row.id_;
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
        missingDataInImeDB.push(id);
      }
    });

    // 添加新数据
    await saveToDB(imeDB, table, dataInRawDB);
    // 更新已存在数据
    await saveToDB(imeDB, table, dataInImeDB);

    // 删除多余数据
    await removeFromDB(imeDB, table, missingDataInImeDB);
  });
}
