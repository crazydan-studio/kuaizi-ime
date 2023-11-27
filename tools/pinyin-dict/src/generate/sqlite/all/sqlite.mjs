import { splitChars, appendLineToFile } from '../../../utils/utils.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQL,
  asyncForEach
} from '../../../utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '../../../utils/sqlite.mjs';

/** 保存拼音和注音信息 */
export async function saveSpells(db, wordMetas) {
  await execSQL(
    db,
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

-- --------------------------------------------------------------
-- 不含声调的注音字符组合
CREATE TABLE
    IF NOT EXISTS meta_zhuyin_chars (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        UNIQUE (value_)
    );
-- 含声调的注音：可根据 id_ 大小排序
CREATE TABLE
    IF NOT EXISTS meta_zhuyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        -- 注音字符组合 id
        chars_id_ INTEGER NOT NULL,
        UNIQUE (value_),
        FOREIGN KEY (chars_id_) REFERENCES meta_zhuyin_chars (id_)
    );
  `
  );

  await asyncForEach(
    [
      {
        prop: 'pinyins',
        table: 'meta_pinyin',
        chars_table: 'meta_pinyin_chars'
      },
      {
        prop: 'zhuyins',
        table: 'meta_zhuyin',
        chars_table: 'meta_zhuyin_chars'
      }
    ],
    async ({ prop, table, chars_table }) => {
      // ================================================================
      const spellMetaData = {};
      const charsMetaData = {};
      wordMetas.forEach((wordMeta) => {
        wordMeta[prop].forEach(({ value, chars }) => {
          if (value && !spellMetaData[value]) {
            spellMetaData[value] = {
              __chars__: chars,
              value_: value
            };
          }

          if (chars && !charsMetaData[chars]) {
            charsMetaData[chars] = {
              value_: chars
            };
          }
        });
      });

      // ================================================================
      const missingCharsMetas = [];
      (await db.all(`SELECT * FROM ${chars_table}`)).forEach((row) => {
        const value = row.value_;
        const id = row.id_;

        if (charsMetaData[value]) {
          charsMetaData[value].id_ = id;
          charsMetaData[value].__exist__ = row;
        } else {
          // 在库中已存在，但未使用
          missingCharsMetas.push(id);
        }
      });
      await saveToDB(db, chars_table, charsMetaData);
      await removeFromDB(db, chars_table, missingCharsMetas);

      // 获取新增字符组合 id
      (await db.all(`SELECT id_, value_ FROM ${chars_table}`)).forEach(
        (row) => {
          const value = row.value_;
          charsMetaData[value].id_ = row.id_;
        }
      );

      // ================================================================
      // 绑定读音与其字符组合
      Object.keys(spellMetaData).forEach((k) => {
        const spell = spellMetaData[k];
        const chars_id_ = (charsMetaData[spell.__chars__] || {}).id_;

        if (!chars_id_) {
          console.log('读音的字母组合不存在：', spell.value_, spell.__chars__);
        }

        spell.chars_id_ = chars_id_;
      });

      const missingSpellMetas = [];
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const value = row.value_;
        const id = row.id_;

        if (spellMetaData[value]) {
          spellMetaData[value].id_ = id;
          spellMetaData[value].__exist__ = row;
        } else {
          // 在库中已存在，但未使用
          missingSpellMetas.push(id);
        }
      });

      await saveToDB(db, table, spellMetaData);
      await removeFromDB(db, table, missingSpellMetas);
    }
  );
}

/** 保存字信息 */
export async function saveWords(db, wordMetas) {
  await execSQL(
    db,
    `
CREATE TABLE
    IF NOT EXISTS meta_word_radical (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        -- 笔画数
        stroke_count_ INTEGER DEFAULT 0,
        UNIQUE (value_)
    );

CREATE TABLE
    IF NOT EXISTS meta_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        unicode_ TEXT NOT NULL,
        -- 部首 id
        radical_id_ INTEGER DEFAULT NULL,
        -- 字形结构
        glyph_struct_ TEXT DEFAULT '',
        -- 笔画顺序：1 - 横，2 - 竖，3 - 撇，4 - 捺，5 - 折
        stroke_order_ TEXT DEFAULT '',
        -- 总笔画数
        total_stroke_count_ INTEGER DEFAULT 0,
        -- 是否为繁体字
        traditional_ INTEGER DEFAULT 0,
        -- 按字形排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (value_),
        FOREIGN KEY (radical_id_) REFERENCES meta_word_radical (id_)
    );

-- --------------------------------------------------------------
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
CREATE TABLE
    IF NOT EXISTS meta_word_with_zhuyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        word_id_ INTEGER NOT NULL,
        -- 注音 id
        spell_id_ INTEGER NOT NULL,
        -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
        glyph_weight_ INTEGER DEFAULT 0,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (word_id_, spell_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (spell_id_) REFERENCES meta_zhuyin (id_)
    );

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
CREATE TABLE
    IF NOT EXISTS link_word_with_variant_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 源字 id
        source_id_ INTEGER NOT NULL,
        -- 变体字 id
        target_id_ INTEGER NOT NULL,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_word (id_)
    );

-- --------------------------------------------------------------
CREATE TABLE
    IF NOT EXISTS meta_word_wubi_code (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        word_id_ INTEGER NOT NULL,
        UNIQUE (value_, word_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_)
    );
CREATE TABLE
    IF NOT EXISTS meta_word_cangjie_code (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        word_id_ INTEGER NOT NULL,
        UNIQUE (value_, word_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_)
    );
CREATE TABLE
    IF NOT EXISTS meta_word_zhengma_code (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        word_id_ INTEGER NOT NULL,
        UNIQUE (value_, word_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_)
    );
CREATE TABLE
    IF NOT EXISTS meta_word_sijiao_code (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        word_id_ INTEGER NOT NULL,
        UNIQUE (value_, word_id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word (id_)
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

CREATE VIEW
    IF NOT EXISTS link_word_with_zhuyin (
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
    meta_word_with_zhuyin meta_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = meta_.spell_id_;

-- --------------------------------------------------------------
-- 字及其拼音
CREATE VIEW
    IF NOT EXISTS pinyin_word (
        id_,
        word_,
        word_id_,
        unicode_,
        weight_,
        spell_,
        spell_id_,
        spell_weight_,
        spell_chars_,
        spell_chars_id_,
        glyph_weight_,
        glyph_struct_,
        radical_,
        radical_stroke_count_,
        stroke_order_,
        total_stroke_count_,
        traditional_,
        simple_word_,
        traditional_word_,
        variant_word_
    ) AS
SELECT
    word_lnk_.id_,
    word_.value_,
    word_.id_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    spell_.id_,
    word_lnk_.weight_,
    spell_ch_.value_,
    spell_ch_.id_,
    word_lnk_.glyph_weight_,
    word_.glyph_struct_,
    radical_.value_,
    radical_.stroke_count_,
    word_.stroke_order_,
    word_.total_stroke_count_,
    word_.traditional_,
    sw_.value_,
    tw_.value_,
    vw_.value_
FROM
    meta_word word_
    --
    LEFT JOIN meta_word_with_pinyin word_lnk_ on word_lnk_.word_id_ = word_.id_
    --
    LEFT JOIN meta_word_radical radical_ on radical_.id_ = word_.radical_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = word_lnk_.spell_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
    --
    LEFT JOIN link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
    LEFT JOIN link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
    LEFT JOIN link_word_with_variant_word vw_lnk_ on vw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word vw_ on vw_.id_ = vw_lnk_.target_id_;

-- 字及其注音
CREATE VIEW
    IF NOT EXISTS zhuyin_word (
        id_,
        word_,
        word_id_,
        unicode_,
        weight_,
        spell_,
        spell_id_,
        spell_weight_,
        spell_chars_,
        spell_chars_id_,
        glyph_weight_,
        glyph_struct_,
        radical_,
        radical_stroke_count_,
        stroke_order_,
        total_stroke_count_,
        traditional_,
        simple_word_,
        traditional_word_,
        variant_word_
    ) AS
SELECT
    word_lnk_.id_,
    word_.value_,
    word_.id_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    spell_.id_,
    word_lnk_.weight_,
    spell_ch_.value_,
    spell_ch_.id_,
    word_lnk_.glyph_weight_,
    word_.glyph_struct_,
    radical_.value_,
    radical_.stroke_count_,
    word_.stroke_order_,
    word_.total_stroke_count_,
    word_.traditional_,
    sw_.value_,
    tw_.value_,
    vw_.value_
FROM
    meta_word word_
    --
    LEFT JOIN meta_word_with_zhuyin word_lnk_ on word_lnk_.word_id_ = word_.id_
    --
    LEFT JOIN meta_word_radical radical_ on radical_.id_ = word_.radical_id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = word_lnk_.spell_id_
    LEFT JOIN meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
    --
    LEFT JOIN link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
    LEFT JOIN link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
    LEFT JOIN link_word_with_variant_word vw_lnk_ on vw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word vw_ on vw_.id_ = vw_lnk_.target_id_;

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

  // ================================================================
  const wordMetaData = {};
  const wordRadicalMetaData = {};
  wordMetas.forEach((meta) => {
    wordMetaData[meta.value] = {
      __meta__: meta,
      value_: meta.value,
      unicode_: meta.unicode,
      glyph_struct_: meta.glyph_struct,
      stroke_order_: meta.stroke_order,
      total_stroke_count_: meta.total_stroke_count,
      traditional_: meta.traditional,
      weight_: meta.weight || 0
    };

    const radical = meta.radical;
    wordRadicalMetaData[radical] = {
      value_: radical,
      stroke_count_: meta.radical_stroke_count
    };
  });

  // ================================================================
  // 保存字部首信息
  const missingWordRadicals = [];
  (await db.all('SELECT * FROM meta_word_radical')).forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (wordRadicalMetaData[value]) {
      wordRadicalMetaData[value].id_ = id;
      wordRadicalMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但未使用
      missingWordRadicals.push(id);
    }
  });
  await saveToDB(db, 'meta_word_radical', wordRadicalMetaData);
  await removeFromDB(db, 'meta_word_radical', missingWordRadicals);

  // 获取新增字部首 id
  (await db.all('SELECT id_, value_ FROM meta_word_radical')).forEach((row) => {
    const value = row.value_;
    wordRadicalMetaData[value].id_ = row.id_;
  });

  // ================================================================
  // 绑定字与其部首
  Object.keys(wordMetaData).forEach((k) => {
    const word = wordMetaData[k];
    const radical = word.__meta__.radical;
    const radical_id_ = (wordRadicalMetaData[radical] || {}).id_;

    if (!radical_id_) {
      console.log('字的部首不存在：', word.value_, radical);
    }

    word.radical_id_ = radical_id_;
  });

  // 保存字信息
  const missingWords = [];
  (await db.all('SELECT * FROM meta_word')).forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (wordMetaData[value]) {
      wordMetaData[value].id_ = id;
      wordMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但未使用
      missingWords.push(id);
    }
  });
  await saveToDB(db, 'meta_word', wordMetaData);
  await removeFromDB(db, 'meta_word', missingWords);

  // 获取新增字 id
  (await db.all('SELECT id_, value_ FROM meta_word')).forEach((row) => {
    const value = row.value_;
    wordMetaData[value].id_ = row.id_;
  });

  // ================================================================
  // 绑定读音关联
  await asyncForEach(
    [
      {
        prop: 'pinyins',
        table: 'meta_word_with_pinyin',
        target_meta_table: 'meta_pinyin'
      },
      {
        prop: 'zhuyins',
        table: 'meta_word_with_zhuyin',
        target_meta_table: 'meta_zhuyin'
      }
    ],
    async ({ prop, table, target_meta_table }) => {
      const targetMetaMap = {};
      (await db.all(`SELECT id_, value_ FROM ${target_meta_table}`)).forEach(
        (row) => {
          targetMetaMap[row.value_] = row.id_;
        }
      );

      const linkDataMap = {};
      Object.values(wordMetaData).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const word_id_ = source.id_;
          const spell_id_ = targetMetaMap[target.value];
          const weight_ = target.weight || 0;
          const glyph_weight_ = target.glyph_weight || 0;

          const code = word_id_ + ':' + spell_id_;
          linkDataMap[code] = {
            word_id_,
            spell_id_,
            weight_,
            glyph_weight_
          };
        });
      });

      const missingLinks = [];
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const id = row.id_;
        const code = row.word_id_ + ':' + row.spell_id_;

        if (linkDataMap[code]) {
          linkDataMap[code].id_ = id;
          linkDataMap[code].__exist__ = row;
        } else {
          // 在库中已存在，但未使用
          missingLinks.push(id);
        }
      });

      await saveToDB(db, table, linkDataMap);
      await removeFromDB(db, table, missingLinks);
    }
  );

  // ================================================================
  // 绑定字与字的关联
  await asyncForEach(
    [
      {
        prop: 'simple_words',
        table: 'link_word_with_simple_word'
      },
      {
        prop: 'variant_words',
        table: 'link_word_with_variant_word'
      },
      {
        prop: 'traditional_words',
        table: 'link_word_with_traditional_word'
      }
    ],
    async ({ prop, table }) => {
      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = row.source_id_ + ':' + row.target_id_;
        linkData[code] = {
          ...row,
          __exist__: row
        };
      });

      Object.values(wordMetaData).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const source_id_ = source.id_;
          const target_id_ = (wordMetaData[target] || {}).id_;
          if (!target_id_) {
            return;
          }

          const code = source_id_ + ':' + target_id_;
          if (!linkData[code]) {
            // 新增关联
            linkData[code] = {
              source_id_,
              target_id_
            };
          } else {
            // 关联无需更新
            delete linkData[code];
          }
        });
      });

      const missingLinks = [];
      Object.keys(linkData).forEach((code) => {
        const id = linkData[code].id_;

        if (id) {
          // 关联在库中已存在，但未变更
          missingLinks.push(id);

          delete linkData[code];
        }
      });

      await saveToDB(db, table, linkData);
      await removeFromDB(db, table, missingLinks);
    }
  );

  // ================================================================
  // 绑定字与编码的关联
  await asyncForEach(
    [
      {
        prop: 'wubi_codes',
        table: 'meta_word_wubi_code'
      },
      {
        prop: 'cangjie_codes',
        table: 'meta_word_cangjie_code'
      },
      {
        prop: 'zhengma_codes',
        table: 'meta_word_zhengma_code'
      },
      {
        prop: 'sijiao_codes',
        table: 'meta_word_sijiao_code'
      }
    ],
    async ({ prop, table }) => {
      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = row.value_ + ':' + row.word_id_;
        linkData[code] = {
          ...row,
          __exist__: row
        };
      });

      Object.values(wordMetaData).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const value_ = target;
          const word_id_ = source.id_;
          const code = value_ + ':' + word_id_;

          if (!linkData[code]) {
            // 新增关联
            linkData[code] = {
              value_,
              word_id_
            };
          } else {
            // 关联无需更新
            delete linkData[code];
          }
        });
      });

      const missingLinks = [];
      Object.keys(linkData).forEach((code) => {
        const id = linkData[code].id_;

        if (id) {
          // 关联在库中已存在，但未变更
          missingLinks.push(id);

          delete linkData[code];
        }
      });

      await saveToDB(db, table, linkData);
      await removeFromDB(db, table, missingLinks);
    }
  );
}

/** 保存词组信息 */
export async function savePhrases(db, wordMetas) {
  await execSQL(
    db,
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

-- --------------------------------------------------------------
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
CREATE TABLE
    IF NOT EXISTS meta_phrase_with_zhuyin_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语 id
        phrase_id_ INTEGER NOT NULL,
        -- 字及其注音关联表 meta_word_with_zhuyin 的 id
        word_id_ INTEGER NOT NULL,
        -- 字在短语中的序号
        word_index_ INTEGER NOT NULL,
        UNIQUE (
            phrase_id_,
            word_id_,
            word_index_
        ),
        FOREIGN KEY (phrase_id_) REFERENCES meta_phrase (id_),
        FOREIGN KEY (word_id_) REFERENCES meta_word_with_zhuyin (id_)
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

CREATE VIEW
    IF NOT EXISTS link_phrase_with_zhuyin_word (
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
    meta_phrase_with_zhuyin_word meta_
    --
    LEFT JOIN meta_word_with_zhuyin word_ on word_.id_ = meta_.word_id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = word_.spell_id_;

-- --------------------------------------------------------------
-- 短语及其拼音
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
    lnk_.word_index_,
    spell_.value_,
    spell_ch_.value_,
    spell_.chars_id_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN meta_phrase_with_pinyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
    --
    LEFT JOIN meta_word_with_pinyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
    LEFT JOIN meta_word word_ on word_.id_ = word_lnk_.word_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = word_lnk_.spell_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    phrase_.index_ asc,
    lnk_.word_index_ asc;

  -- 短语及其注音
CREATE VIEW
    IF NOT EXISTS zhuyin_phrase (
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
    lnk_.word_index_,
    spell_.value_,
    spell_ch_.value_,
    spell_ch_.id_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN meta_phrase_with_zhuyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
    --
    LEFT JOIN meta_word_with_zhuyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
    LEFT JOIN meta_word word_ on word_.id_ = word_lnk_.word_id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = word_lnk_.spell_id_
    LEFT JOIN meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    phrase_.index_ asc,
    lnk_.word_index_ asc;
    `
  );

  // ================================================================
  const phraseMetaMap = wordMetas.reduce((map, meta) => {
    meta.phrases.forEach((phrase) => {
      const value = phrase.value.join('');
      const weight = phrase.weight || 0;

      phrase.pinyins.forEach((pinyin, index) => {
        if (phrase.value.length !== pinyin.value.length) {
          return;
        }

        const code = `${value}:${index}`;
        const zhuyin = phrase.zhuyins[index] || { value: [] };
        map[code] = {
          __meta__: {
            value: phrase.value,
            pinyins: pinyin.value,
            zhuyins:
              zhuyin.value.length !== phrase.value.length ? [] : zhuyin.value
          },
          value_: value,
          index_: index,
          weight_: weight
        };
      });
    });

    return map;
  }, {});

  // ================================================================
  // 保存短语信息
  const missingPhrases = [];
  (await db.all('SELECT * FROM meta_phrase')).forEach((row) => {
    const value = row.value_;
    const id = row.id_;
    const code = `${value}:${row.index_}`;

    if (phraseMetaMap[code]) {
      phraseMetaMap[code].id_ = id;
      phraseMetaMap[code].__exist__ = row;
    } else {
      missingPhrases.push(id);
    }
  });
  await saveToDB(db, 'meta_phrase', phraseMetaMap);
  await removeFromDB(db, 'meta_phrase', missingPhrases);

  // 获取新增短语 id
  (await db.all('SELECT id_, value_, index_ FROM meta_phrase')).forEach(
    (row) => {
      const value = row.value_;
      const code = `${value}:${row.index_}`;

      phraseMetaMap[code].id_ = row.id_;
    }
  );

  // ================================================================
  // 绑定读音关联
  await asyncForEach(
    [
      {
        prop: 'pinyins',
        table: 'meta_phrase_with_pinyin_word',
        word_table: 'meta_word',
        word_spell_link_table: 'meta_word_with_pinyin',
        word_spell_table: 'meta_pinyin'
      },
      {
        prop: 'zhuyins',
        table: 'meta_phrase_with_zhuyin_word',
        word_table: 'meta_word',
        word_spell_link_table: 'meta_word_with_zhuyin',
        word_spell_table: 'meta_zhuyin'
      }
    ],
    async ({
      prop,
      table,
      word_table,
      word_spell_link_table,
      word_spell_table
    }) => {
      // ================================================================
      const wordData = {};
      (
        await db.all(
          `SELECT
              ws_lnk_.id_ as id_,
              w_.value_ as value_,
              ws_.value_ as spell_value_
          FROM ${word_spell_link_table} ws_lnk_
          INNER JOIN ${word_table} w_ on w_.id_ = ws_lnk_.word_id_
          INNER JOIN ${word_spell_table} ws_ on ws_.id_ = ws_lnk_.spell_id_
          `
        )
      ).forEach((row) => {
        const code = `${row.value_}:${row.spell_value_}`;

        wordData[code] = {
          id_: row.id_
        };
      });

      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = `${row.phrase_id_}:${row.word_id_}:${row.word_index_}`;

        linkData[code] = {
          ...row,
          __exist__: row
        };
      });

      // ================================================================
      Object.values(phraseMetaMap).forEach((phrase) => {
        const phrase_value = phrase.value_;
        const word_values = phrase.__meta__.value;
        const word_spell_values = phrase.__meta__[prop];

        // 字和读音个数不同，则忽略该词组
        if (
          word_values.length !== word_spell_values.length &&
          word_spell_values.length !== 0
        ) {
          console.log(
            `词组 '${phrase_value}' 的字数与读音数不同(${prop})：${word_spell_values.join(
              ','
            )}`
          );
          return;
        }

        const words = [];
        for (
          let word_value_index = 0;
          word_value_index < word_values.length;
          word_value_index++
        ) {
          const word_value = word_values[word_value_index];
          const word_spell_value = word_spell_values[word_value_index];

          // 字+读音
          const word_code = `${word_value}:${word_spell_value}`;
          const word = wordData[word_code];

          // 对应读音的字不存在，则直接跳过该词组
          if (!word) {
            console.log(
              `词组 '${phrase_value}' 中不存在字 '${word_value}(${word_spell_value})': ${word_spell_values.join(
                ','
              )}`
            );
          } else {
            words.push(word);
          }
        }

        if (words.length !== word_values.length) {
          return;
        }

        // ================================================================
        for (let word_index = 0; word_index < words.length; word_index++) {
          const word = words[word_index];
          const link_code = `${phrase.id_}:${word.id_}:${word_index}`;

          if (!linkData[link_code]) {
            // 新增关联
            linkData[link_code] = {
              phrase_id_: phrase.id_,
              // 与 字的读音关联表 建立联系
              word_id_: word.id_,
              word_index_: word_index
            };
          } else {
            // 关联无需更新
            delete linkData[link_code];
          }
        }
      });

      const missingLinks = [];
      Object.keys(linkData).forEach((code) => {
        const id = linkData[code].id_;

        if (id) {
          // 关联在库中已存在，但未变更
          missingLinks.push(id);

          delete linkData[code];
        }
      });

      await saveToDB(db, table, linkData);
      await removeFromDB(db, table, missingLinks);
    }
  );
}

/** 保存表情符号 */
export async function saveEmojis(db, groupEmojiMetas) {
  // 对表情关键字采取按字（非拼音）匹配策略，
  // 仅关键字与查询字相同时才视为匹配上，可做单字或多字匹配
  await execSQL(
    db,
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
        -- 表情符号
        value_ TEXT NOT NULL,
        unicode_ TEXT NOT NULL,
        unicode_version_ REAL NOT NULL,
        group_id_ INTERGET NOT NULL,
        UNIQUE (value_),
        FOREIGN KEY (group_id_) REFERENCES meta_emoji_group (id_)
    );

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
CREATE INDEX IF NOT EXISTS idx_lnk_emo_kwd_wrd ON link_emoji_with_keyword (target_word_id_);

-- 表情及其关键字
CREATE VIEW
    IF NOT EXISTS emoji (
        id_,
        value_,
        unicode_,
        unicode_version_,
        group_,
        keyword_index_,
        keyword_word_,
        keyword_word_id_,
        keyword_word_index_
    ) AS
SELECT
    emo_.id_,
    emo_.value_,
    emo_.unicode_,
    emo_.unicode_version_,
    grp_.value_,
    lnk_.target_index_,
    word_.value_,
    word_.id_,
    lnk_.target_word_index_
FROM
    meta_emoji emo_
    --
    LEFT JOIN link_emoji_with_keyword lnk_ on lnk_.source_id_ = emo_.id_
    LEFT JOIN meta_word word_ on word_.id_ = lnk_.target_word_id_
    LEFT JOIN meta_emoji_group grp_ on grp_.id_ = emo_.group_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    lnk_.target_index_ asc,
    lnk_.target_word_index_ asc;
    `
  );

  const emojiGroupMap = Object.keys(groupEmojiMetas).reduce((map, group) => {
    map[group] = { value_: group };

    return map;
  }, {});

  // 保存表情分组信息
  const missingEmojiGroups = [];
  (await db.all('SELECT * FROM meta_emoji_group')).forEach((row) => {
    const id = row.id_;
    const code = row.value_;

    if (emojiGroupMap[code]) {
      emojiGroupMap[code].id_ = id;
      emojiGroupMap[code].__exist__ = row;
    } else {
      missingEmojiGroups.push(id);
    }
  });
  await saveToDB(db, 'meta_emoji_group', emojiGroupMap);
  await removeFromDB(db, 'meta_emoji_group', missingEmojiGroups);

  // 获取新增表情分组 id
  (await db.all('SELECT * FROM meta_emoji_group')).forEach((row) => {
    const code = row.value_;

    emojiGroupMap[code].id_ = row.id_;
  });

  const emojiMetaMap = {};
  Object.keys(groupEmojiMetas).forEach((group) => {
    groupEmojiMetas[group].forEach((meta) => {
      meta.keywords = meta.keywords.sort();

      const code = meta.value;
      emojiMetaMap[code] = {
        __meta__: meta,
        value_: meta.value,
        unicode_: meta.unicode,
        unicode_version_: meta.unicode_version,
        group_id_: emojiGroupMap[group].id_
      };
    });
  });

  // 保存表情信息
  const missingEmojis = [];
  (await db.all('SELECT * FROM meta_emoji')).forEach((row) => {
    const id = row.id_;
    const code = row.value_;

    if (emojiMetaMap[code]) {
      emojiMetaMap[code].id_ = id;
      emojiMetaMap[code].__exist__ = row;
    } else {
      missingEmojis.push(id);
    }
  });
  await saveToDB(db, 'meta_emoji', emojiMetaMap, true);
  await removeFromDB(db, 'meta_emoji', missingEmojis);

  // 获取新增表情 id
  (await db.all('SELECT * FROM meta_emoji')).forEach((row) => {
    const code = row.value_;

    emojiMetaMap[code].id_ = row.id_;
  });

  // 绑定关键字关联
  await asyncForEach(
    [
      {
        table: 'link_emoji_with_keyword',
        target_word_table: 'meta_word'
      }
    ],
    async ({ table, target_word_table }) => {
      const targetWordData = {};
      (await db.all(`SELECT id_, value_ FROM ${target_word_table}`)).forEach(
        (row) => {
          const code = row.value_;

          targetWordData[code] = {
            id_: row.id_,
            value_: row.value_
          };
        }
      );

      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = `${row.source_id_}:${row.target_index_}:${row.target_word_id_}:${row.target_word_index_}`;

        linkData[code] = {
          ...row,
          __exist__: row
        };
      });

      Object.values(emojiMetaMap).forEach((source) => {
        const source_value = source.value_;
        const target_values = source.__meta__.keywords;

        target_values.forEach((target_value, target_index_) => {
          const target_words = splitChars(target_value);

          target_words.forEach((target_word, target_word_index_) => {
            const target_word_id_ = (targetWordData[target_word] || {}).id_;

            if (!target_word_id_) {
              console.log(
                `表情 '${source_value}' 的关键字 '${target_word}' 不存在字 '${target_word}'`
              );
              return;
            }

            const source_id_ = source.id_;
            const link_code = `${source_id_}:${target_index_}:${target_word_id_}:${target_word_index_}`;
            if (!linkData[link_code]) {
              // 新增关联
              linkData[link_code] = {
                source_id_: source_id_,
                target_index_: target_index_,
                target_word_id_: target_word_id_,
                target_word_index_: target_word_index_
              };
            } else {
              // 关联无需更新
              delete linkData[link_code];
            }
          });
        });
      });

      const missingLinks = [];
      Object.keys(linkData).forEach((code) => {
        const id = linkData[code].id_;

        if (id) {
          // 关联在库中已存在，但未变更
          missingLinks.push(id);

          delete linkData[code];
        }
      });

      await saveToDB(db, table, linkData);
      await removeFromDB(db, table, missingLinks);
    }
  );
}

/** 生成拼音字母组合数据 */
export async function generatePinyinChars(db, file) {
  const values = [];
  const nextCharsMap = {};
  (
    await db.all('SELECT value_ FROM meta_pinyin_chars ORDER BY value_')
  ).forEach((row) => {
    const value = row.value_;
    values.push(value);

    const nextChars =
      value.charAt(1) === 'h' ? value.substring(2) : value.substring(1);
    nextChars && (nextCharsMap[nextChars] = true);
  });

  console.log(
    '- 后继字母列表: ',
    JSON.stringify(Object.keys(nextCharsMap).sort())
  );

  appendLineToFile(file, values.join('\n'), true);
}

/** 生成拼音字母组合数据 */
export async function generatePinyinCharLinks(db, file) {
  const links = {};
  (
    await db.all('SELECT value_ FROM meta_pinyin_chars ORDER BY value_')
  ).forEach((row) => {
    const value = row.value_;
    const chars = splitChars(value);

    if (chars.length > 1) {
      for (let i = 1; i < chars.length; i++) {
        const source = chars[i - 1];
        const target = chars[i];

        (links[source] ||= {})[target] = true;
      }
    }
  });

  const results = [];
  Object.keys(links).forEach((source) => {
    Object.keys(links[source]).forEach((target) => {
      results.push({ source, target });
    });
  });

  appendLineToFile(file, JSON.stringify(results), true);
}

/** 生成拼音字母后继树数据 */
export async function generatePinyinCharTree(db, file) {
  const tree = {};
  (
    await db.all('SELECT value_ FROM meta_pinyin_chars ORDER BY value_')
  ).forEach((row) => {
    const value = row.value_;
    const chars = splitChars(value);

    if (chars.length > 1) {
      let parent = tree;
      let child;

      for (let i = 1; i < chars.length; i++) {
        const source = chars[i - 1];
        const target = chars[i];

        parent = parent[source] ||= {};
        child = parent[target] ||= {};
      }

      child.__is_pinyin__ = true;
    } else {
      const source = chars[0];
      tree[source] = { __is_pinyin__: true };
    }
  });

  const getKeys = (obj) =>
    Object.keys(obj).filter((k) => !k.startsWith('__') && !k.endsWith('__'));
  const traverse = (links, top, level, prefix) => {
    const parent = links[top];

    prefix ||= '';

    const subs = getKeys(parent).sort();
    if (subs.length === 0) {
      return { name: prefix + top, pinyin: true, level };
    }

    if (level > 1) {
      const result = subs
        .reduce((r, sub) => {
          const child = traverse(parent, sub, level + 1);
          if (Array.isArray(child)) {
            r.push(...child.map((c) => top + c.name));
          } else if (typeof child === 'string') {
            r.push(top + child);
          } else {
            r.push(top + child.name);
          }

          return r;
        }, [])
        .concat(parent.__is_pinyin__ ? [top] : [])
        .sort()
        .map((sub) => ({ name: prefix + sub, pinyin: true, level }));

      return result;
    }

    const children = [];
    subs.forEach((sub) => {
      let child;

      if (['c', 's', 'z'].includes(top) && sub === 'h') {
        child = traverse(parent, sub, 0);
      } else {
        child = traverse(parent, sub, level + 1, level > 0 ? top : '');
      }

      if (Array.isArray(child)) {
        children.push(...child);
      } else {
        children.push(child);
      }
    });

    if (parent.__is_pinyin__) {
      return { name: top, pinyin: true, level, children };
    }
    return { name: top, level, children };
  };

  const results = [];
  getKeys(tree).forEach((source) => {
    const child = traverse(tree, source, 0);
    results.push(child);
  });

  appendLineToFile(file, JSON.stringify({ name: '', children: results }), true);
}
