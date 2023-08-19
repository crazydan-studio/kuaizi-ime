import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '../../../utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '../../../utils/sqlite.mjs';

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
        UNIQUE (value_)
    );
      `
  );

  await syncTableData(imeDB, rawDB, ['meta_pinyin', 'meta_pinyin_chars']);
}

/** 同步字信息 */
export async function syncWords(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
CREATE TABLE
    IF NOT EXISTS meta_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        -- 笔画顺序：1 - 横，2 - 竖，3 - 撇，4 - 捺，5 - 折
        stroke_order_ TEXT DEFAULT '',
        -- 是否为繁体字
        traditional_ INTEGER DEFAULT 0,
        -- 按字形排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (value_)
    );

CREATE TABLE
    IF NOT EXISTS link_word_with_pinyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        source_id_ INTEGER NOT NULL,
        -- 拼音 id
        target_id_ INTEGER NOT NULL,
        -- 拼音字母组合 id
        target_chars_id_ INTEGER NOT NULL,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_pinyin (id_),
        FOREIGN KEY (target_chars_id_) REFERENCES meta_pinyin_chars (id_)
    );
CREATE INDEX IF NOT EXISTS idx_lnk_wrd_py_chars ON link_word_with_pinyin (target_chars_id_);

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

-- 字及其拼音：先按字形权重降序排序，再在 top5 候选字页面显示按读音权重排序的结果
CREATE VIEW
    IF NOT EXISTS pinyin_word (
        id_,
        value_,
        weight_,
        spell_,
        spell_weight_,
        spell_chars_,
        spell_chars_id_,
        stroke_order_,
        traditional_
    ) AS
SELECT
    word_.id_,
    word_.value_,
    word_.weight_,
    spell_.value_,
    lnk_.weight_,
    spell_ch_.value_,
    spell_ch_.id_,
    word_.stroke_order_,
    word_.traditional_
FROM
    meta_word word_
    --
    LEFT JOIN link_word_with_pinyin lnk_ on lnk_.source_id_ = word_.id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = lnk_.target_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = lnk_.target_chars_id_;

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
    LEFT JOIN link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
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
    LEFT JOIN link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
WHERE
    tw_.id_ IS NOT NULL;
      `
  );

  await syncTableData(imeDB, rawDB, [
    'meta_word',
    'link_word_with_pinyin',
    'link_word_with_simple_word',
    'link_word_with_traditional_word'
  ]);
}

/** 同步词组信息 */
export async function syncPhrases(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
CREATE TABLE
    IF NOT EXISTS meta_phrase (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语文本内容
        value_ TEXT NOT NULL,
        -- 短语序号：针对排序后的多音词的词序号
        index_ INTEGER NOT NULL,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (value_, index_)
    );

CREATE TABLE
    IF NOT EXISTS link_phrase_with_pinyin_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语 id
        source_id_ INTEGER NOT NULL,
        -- 字及其拼音关联表 link_word_with_pinyin 的 id
        target_id_ INTEGER NOT NULL,
        -- 拼音字母组合 id
        target_spell_chars_id_ INTEGER NOT NULL,
        -- 字在词中的序号
        target_index_ INTEGER NOT NULL,
        UNIQUE (
            source_id_,
            target_id_,
            target_index_
        ),
        FOREIGN KEY (source_id_) REFERENCES meta_phrase (id_),
        FOREIGN KEY (
            target_id_,
            target_spell_chars_id_
        ) REFERENCES link_word_with_pinyin (id_, target_chars_id_)
    );
CREATE INDEX IF NOT EXISTS idx_lnk_phrs_pywd_chars ON link_phrase_with_pinyin_word (target_spell_chars_id_);

-- 词及其拼音
CREATE VIEW
    IF NOT EXISTS pinyin_phrase (
        id_,
        value_,
        index_,
        weight_,
        word_,
        word_index_,
        word_spell_,
        word_spell_chars_,
        word_spell_chars_id_
    ) AS
SELECT
    phrase_.id_,
    phrase_.value_,
    phrase_.index_,
    phrase_.weight_,
    word_.value_,
    lnk_.target_index_,
    spell_.value_,
    spell_ch_.value_,
    spell_ch_.id_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN link_phrase_with_pinyin_word lnk_ on lnk_.source_id_ = phrase_.id_
    --
    LEFT JOIN link_word_with_pinyin spell_lnk_ on spell_lnk_.id_ = lnk_.target_id_
    LEFT JOIN meta_word word_ on word_.id_ = spell_lnk_.source_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = spell_lnk_.target_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = spell_lnk_.target_chars_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    phrase_.index_ asc,
    lnk_.target_index_ asc;
      `
  );

  // Note：仅同步有权重的短语
  await syncTableData(imeDB, rawDB, [
    {
      name: 'meta_phrase',
      select: 'select * from meta_phrase where weight_ > 0'
    },
    {
      name: 'link_phrase_with_pinyin_word',
      select: `
    select
      *
    from
      link_phrase_with_pinyin_word
    where
      source_id_ in (
        select id_ from meta_phrase where weight_ > 0
      )
    `
    }
  ]);
}

/** 同步表情符号信息 */
export async function syncEmotions(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
CREATE TABLE
    IF NOT EXISTS meta_emotion (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 表情符号
        value_ TEXT NOT NULL,
        UNIQUE (value_)
    );

CREATE TABLE
    IF NOT EXISTS link_emotion_with_keyword (
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
        FOREIGN KEY (source_id_) REFERENCES meta_emotion (id_),
        FOREIGN KEY (target_word_id_) REFERENCES meta_word (id_)
    );
CREATE INDEX IF NOT EXISTS idx_lnk_emo_kwd_wrd ON link_emotion_with_keyword (target_word_id_);

-- 表情及其关键字
CREATE VIEW
    IF NOT EXISTS emotion (
        id_,
        value_,
        keyword_index_,
        keyword_word_,
        keyword_word_id_,
        keyword_word_index_
    ) AS
SELECT
    emo_.id_,
    emo_.value_,
    lnk_.target_index_,
    word_.value_,
    word_.id_,
    lnk_.target_word_index_
FROM
    meta_emotion emo_
    --
    LEFT JOIN link_emotion_with_keyword lnk_ on lnk_.source_id_ = emo_.id_
    LEFT JOIN meta_word word_ on word_.id_ = lnk_.target_word_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    lnk_.target_index_ asc,
    lnk_.target_word_index_ asc;
      `
  );

  await syncTableData(imeDB, rawDB, [
    'meta_emotion',
    'link_emotion_with_keyword'
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
