import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '../../../utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '../../../utils/sqlite.mjs';

// 查看表上的索引: PRAGMA index_list('MyTable');
// 查看索引的列: PRAGMA index_info('MyIndex');

/** 同步字读音信息 */
export async function syncSpells(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
-- 不含声调的拼音字母组合
CREATE TABLE
    IF NOT EXISTS meta_pinyin_chars (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        UNIQUE (value_)
    );
-- 含声调的拼音：可根据 id_ 大小排序
CREATE TABLE
    IF NOT EXISTS meta_pinyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        -- 拼音字母组合 id
        chars_id_ INTEGER NOT NULL,
        UNIQUE (value_),
        FOREIGN KEY (chars_id_) REFERENCES meta_pinyin_chars (id_)
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
CREATE TABLE
    IF NOT EXISTS meta_word_radical (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        stroke_count_ INTEGER DEFAULT 0,
        UNIQUE (value_)
    );

-- --------------------------------------------------------------
CREATE TABLE
    IF NOT EXISTS meta_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        -- 笔画顺序：1 - 横，2 - 竖，3 - 撇，4 - 捺，5 - 折
        stroke_order_ TEXT DEFAULT '',
        -- 是否为繁体字
        traditional_ INTEGER DEFAULT 0,
        -- 部首 id
        radical_id_ INTEGER DEFAULT NULL,
        UNIQUE (value_),
        FOREIGN KEY (radical_id_) REFERENCES meta_word_radical (id_)
    );
CREATE TABLE
    IF NOT EXISTS meta_word_with_pinyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        word_id_ INTEGER NOT NULL,
        -- 拼音 id
        spell_id_ INTEGER NOT NULL,
        -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
        glyph_weight_ INTEGER DEFAULT 0,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (word_id_, spell_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (spell_id_) REFERENCES meta_pinyin (id_)
    );

-- --------------------------------------------------------------
CREATE VIEW
    IF NOT EXISTS link_word_with_pinyin (
        id_,
        source_id_,
        target_id_,
        target_chars_id_,
        glyph_weight_,
        weight_
    ) AS
SELECT
    meta_.id_,
    meta_.word_id_,
    meta_.spell_id_,
    spell_.chars_id_,
    meta_.glyph_weight_,
    meta_.weight_
FROM
    meta_word_with_pinyin meta_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = meta_.spell_id_;

-- --------------------------------------------------------------
CREATE TABLE
    IF NOT EXISTS link_word_with_simple_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 源字 id
        source_id_ INTEGER NOT NULL,
        -- 简体字 id
        target_id_ INTEGER NOT NULL,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_word (id_)
    );
CREATE TABLE
    IF NOT EXISTS link_word_with_traditional_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 源字 id
        source_id_ INTEGER NOT NULL,
        -- 繁体字 id
        target_id_ INTEGER NOT NULL,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_word (id_)
    );

-- --------------------------------------------------------------
-- 字及其拼音
CREATE VIEW
    IF NOT EXISTS pinyin_word (
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
    ) AS
SELECT
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
FROM
    meta_word word_
    --
    INNER JOIN meta_word_with_pinyin lnk_ on lnk_.word_id_ = word_.id_
    INNER JOIN meta_pinyin spell_ on spell_.id_ = lnk_.spell_id_
    INNER JOIN meta_word_radical radical_ on radical_.id_ = word_.radical_id_
    ;

-- --------------------------------------------------------------
-- 繁体 -> 简体
CREATE VIEW
    IF NOT EXISTS simple_word (
        -- 繁体字 id
        id_,
        -- 繁体字
        value_,
        -- 简体字 id
        target_id_,
        -- 简体字
        target_value_
    ) AS
SELECT
    word_.id_,
    word_.value_,
    sw_.id_,
    sw_.value_
FROM
    meta_word word_
    --
    INNER JOIN link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    INNER JOIN meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
WHERE
    sw_.id_ IS NOT NULL;

-- 简体 -> 繁体
CREATE VIEW
    IF NOT EXISTS traditional_word (
        -- 简体字 id
        id_,
        -- 简体字
        value_,
        -- 繁体字 id
        target_id_,
        -- 繁体字
        target_value_
    ) AS
SELECT
    word_.id_,
    word_.value_,
    tw_.id_,
    tw_.value_
FROM
    meta_word word_
    --
    INNER JOIN link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    INNER JOIN meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
WHERE
    tw_.id_ IS NOT NULL;
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

/** 同步词组信息 */
export async function syncPhrases(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
-- Note：索引放在输入法初始化时创建，以降低索引造成的字典文件过大
CREATE TABLE
    IF NOT EXISTS meta_phrase (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0
    );

CREATE TABLE
    IF NOT EXISTS meta_phrase_with_pinyin_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语 id
        phrase_id_ INTEGER NOT NULL,
        -- 字及其拼音关联表 meta_word_with_pinyin 的 id
        word_id_ INTEGER NOT NULL,
        -- 字在短语中的序号
        word_index_ INTEGER NOT NULL,
        UNIQUE (
            phrase_id_,
            word_id_,
            word_index_
        ),
        FOREIGN KEY (phrase_id_) REFERENCES meta_phrase (id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word_with_pinyin (id_)
    );

-- --------------------------------------------------------------
CREATE VIEW
    IF NOT EXISTS link_phrase_with_pinyin_word (
        id_,
        source_id_,
        target_id_,
        target_spell_chars_id_,
        target_index_
    ) AS
SELECT
    meta_.id_,
    meta_.phrase_id_,
    meta_.word_id_,
    spell_.chars_id_,
    meta_.word_index_
FROM
    meta_phrase_with_pinyin_word meta_
    --
    LEFT JOIN meta_word_with_pinyin word_ on word_.id_ = meta_.word_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = word_.spell_id_;

-- --------------------------------------------------------------
-- 短语及其拼音
CREATE VIEW
    IF NOT EXISTS pinyin_phrase (
        id_,
        weight_,
        source_id_,
        target_id_,
        target_index_,
        target_spell_chars_id_
    ) AS
SELECT
    lnk_.id_,
    phrase_.weight_,
    lnk_.phrase_id_,
    lnk_.word_id_,
    lnk_.word_index_,
    spell_.chars_id_
FROM
    meta_phrase phrase_
    --
    INNER JOIN meta_phrase_with_pinyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
    --
    LEFT JOIN meta_word_with_pinyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = word_lnk_.spell_id_;
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
CREATE TABLE
    IF NOT EXISTS meta_emoji_group (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        UNIQUE (value_)
    );
CREATE TABLE
    IF NOT EXISTS meta_emoji (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        group_id_ INTERGET NOT NULL,
        UNIQUE (value_),
        FOREIGN KEY (group_id_) REFERENCES meta_emoji_group (id_)
    );

-- Note：表情的关键字唯一标识由 表情 id 和 关键字的序号 组合而成
CREATE TABLE
    IF NOT EXISTS link_emoji_with_keyword (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 表情 id
        source_id_ INTEGER NOT NULL,
        -- 排序后的表情关键字序号
        target_index_ INTEGER NOT NULL,
        -- 表情关键字中的字 id
        target_word_id_ INTEGER NOT NULL,
        -- 字在表情关键字中的序号
        target_word_index_ INTEGER NOT NULL,
        UNIQUE (
            source_id_,
            target_index_,
            target_word_id_,
            target_word_index_
        ),
        FOREIGN KEY (source_id_) REFERENCES meta_emoji (id_),
        FOREIGN KEY (target_word_id_) REFERENCES meta_word (id_)
    );
-- 索引放在输入法初始化时创建，以降低索引造成的字典文件过大
-- CREATE INDEX IF NOT EXISTS idx_lnk_emo_kwd_wrd ON link_emoji_with_keyword (target_word_id_);

-- 分组表情
CREATE VIEW
    IF NOT EXISTS group_emoji (
        id_,
        value_,
        group_
    ) AS
SELECT
    emo_.id_,
    emo_.value_,
    grp_.value_
FROM
    meta_emoji emo_
    --
    INNER JOIN meta_emoji_group grp_ on grp_.id_ = emo_.group_id_;

-- 表情及其关键字
CREATE VIEW
    IF NOT EXISTS emoji (
        id_,
        value_,
        group_,
        keyword_index_,
        keyword_word_id_,
        keyword_word_index_,
        keyword_word_spell_chars_id_,
        keyword_word_spell_link_id_
    ) AS
SELECT
    emo_.id_,
    emo_.value_,
    grp_.value_,
    lnk_.target_index_,
    lnk_.target_word_id_,
    lnk_.target_word_index_,
    pw_lnk_.target_chars_id_,
    pw_lnk_.id_
FROM
    meta_emoji emo_
    --
    INNER JOIN link_emoji_with_keyword lnk_ on lnk_.source_id_ = emo_.id_
    INNER JOIN link_word_with_pinyin pw_lnk_ on pw_lnk_.source_id_ = lnk_.target_word_id_
    INNER JOIN meta_emoji_group grp_ on grp_.id_ = emo_.group_id_;
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
      await imeDB.all(`SELECT name FROM PRAGMA_TABLE_INFO('${table}');`)
    ).map((row) => row.name);

    const dataInRawDB = {};
    (
      await rawDB.all(
        typeof tableInfo === 'string'
          ? `SELECT * FROM ${table}`
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
    (await imeDB.all(`SELECT * FROM ${table}`)).forEach((row) => {
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
