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
        UNIQUE (value_)
    );

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
        UNIQUE (value_)
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
      const spellMetaData = {};
      const charsMetaData = {};
      wordMetas.forEach((wordMeta) => {
        wordMeta[prop].forEach(({ value, chars }) => {
          if (value && !spellMetaData[value]) {
            spellMetaData[value] = {
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

      await saveToDB(db, table, spellMetaData);
      await removeFromDB(db, table, missingSpellMetas);

      await saveToDB(db, chars_table, charsMetaData);
      await removeFromDB(db, chars_table, missingCharsMetas);
    }
  );
}

/** 保存字信息 */
export async function saveWords(db, wordMetas) {
  await execSQL(
    db,
    `
CREATE TABLE
    IF NOT EXISTS meta_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        value_ TEXT NOT NULL,
        unicode_ TEXT NOT NULL,
        -- 字形结构
        glyph_struct_ TEXT DEFAULT '',
        -- 部首
        radical_ TEXT DEFAULT '',
        -- 笔画顺序：1 - 横，2 - 竖，3 - 撇，4 - 捺，5 - 折
        stroke_order_ TEXT DEFAULT '',
        -- 总笔画数
        total_stroke_count_ INTEGER DEFAULT 0,
        -- 部首笔画数
        radical_stroke_count_ INTEGER DEFAULT 0,
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
        -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
        glyph_weight_ INTEGER DEFAULT 0,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_pinyin (id_),
        FOREIGN KEY (target_chars_id_) REFERENCES meta_pinyin_chars (id_)
    );
CREATE TABLE
    IF NOT EXISTS link_word_with_zhuyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        source_id_ INTEGER NOT NULL,
        -- 注音 id
        target_id_ INTEGER NOT NULL,
        -- 注音字符组合 id
        target_chars_id_ INTEGER NOT NULL,
        -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
        glyph_weight_ INTEGER DEFAULT 0,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_zhuyin (id_),
        FOREIGN KEY (target_chars_id_) REFERENCES meta_zhuyin_chars (id_)
    );
CREATE INDEX IF NOT EXISTS idx_lnk_wrd_py_chars ON link_word_with_pinyin (target_chars_id_);
CREATE INDEX IF NOT EXISTS idx_lnk_wrd_zy_chars ON link_word_with_zhuyin (target_chars_id_);

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
        stroke_order_,
        total_stroke_count_,
        radical_stroke_count_,
        traditional_,
        simple_word_,
        traditional_word_,
        variant_word_
    ) AS
SELECT
    lnk_.id_,
    word_.value_,
    word_.id_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    spell_.id_,
    lnk_.weight_,
    spell_ch_.value_,
    spell_ch_.id_,
    lnk_.glyph_weight_,
    word_.glyph_struct_,
    word_.radical_,
    word_.stroke_order_,
    word_.total_stroke_count_,
    word_.radical_stroke_count_,
    word_.traditional_,
    sw_.value_,
    tw_.value_,
    vw_.value_
FROM
    meta_word word_
    --
    LEFT JOIN link_word_with_pinyin lnk_ on lnk_.source_id_ = word_.id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = lnk_.target_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = lnk_.target_chars_id_
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
        stroke_order_,
        total_stroke_count_,
        radical_stroke_count_,
        traditional_,
        simple_word_,
        traditional_word_,
        variant_word_
    ) AS
SELECT
    lnk_.id_,
    word_.value_,
    word_.id_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    spell_.id_,
    lnk_.weight_,
    spell_ch_.value_,
    spell_ch_.id_,
    lnk_.glyph_weight_,
    word_.glyph_struct_,
    word_.radical_,
    word_.stroke_order_,
    word_.total_stroke_count_,
    word_.radical_stroke_count_,
    word_.traditional_,
    sw_.value_,
    tw_.value_,
    vw_.value_
FROM
    meta_word word_
    --
    LEFT JOIN link_word_with_zhuyin lnk_ on lnk_.source_id_ = word_.id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = lnk_.target_id_
    LEFT JOIN meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = lnk_.target_chars_id_
    --
    LEFT JOIN link_word_with_simple_word sw_lnk_ on sw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word sw_ on sw_.id_ = sw_lnk_.target_id_
    LEFT JOIN link_word_with_traditional_word tw_lnk_ on tw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word tw_ on tw_.id_ = tw_lnk_.target_id_
    LEFT JOIN link_word_with_variant_word vw_lnk_ on vw_lnk_.source_id_ = word_.id_
    LEFT JOIN meta_word vw_ on vw_.id_ = vw_lnk_.target_id_;

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

  const wordMetaMap = wordMetas.reduce((map, meta) => {
    if (map[meta.value]) {
      return map;
    }

    map[meta.value] = {
      __meta__: meta,
      value_: meta.value,
      unicode_: meta.unicode,
      glyph_struct_: meta.glyph_struct,
      radical_: meta.radical,
      stroke_order_: meta.stroke_order,
      total_stroke_count_: meta.total_stroke_count,
      radical_stroke_count_: meta.radical_stroke_count,
      traditional_: meta.traditional,
      weight_: meta.weight || 0
    };

    return map;
  }, {});

  // 保存字信息
  const missingWords = [];
  (await db.all('SELECT * FROM meta_word')).forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (wordMetaMap[value]) {
      wordMetaMap[value].id_ = id;
      wordMetaMap[value].__exist__ = row;
    } else {
      // 在库中已存在，但未使用
      missingWords.push(id);
    }
  });
  await saveToDB(db, 'meta_word', wordMetaMap);
  await removeFromDB(db, 'meta_word', missingWords);

  // 获取新增字 id
  (await db.all('SELECT id_, value_ FROM meta_word')).forEach((row) => {
    const value = row.value_;
    wordMetaMap[value].id_ = row.id_;
  });

  // 绑定读音关联
  await asyncForEach(
    [
      {
        prop: 'pinyins',
        table: 'link_word_with_pinyin',
        target_meta_table: 'meta_pinyin',
        target_chars_table: 'meta_pinyin_chars'
      },
      {
        prop: 'zhuyins',
        table: 'link_word_with_zhuyin',
        target_meta_table: 'meta_zhuyin',
        target_chars_table: 'meta_zhuyin_chars'
      }
    ],
    async ({ prop, table, target_meta_table, target_chars_table }) => {
      const targetMetaMap = {};
      (await db.all(`SELECT id_, value_ FROM ${target_meta_table}`)).forEach(
        (row) => {
          targetMetaMap[row.value_] = row.id_;
        }
      );
      const targetCharsMap = {};
      (await db.all(`SELECT id_, value_ FROM ${target_chars_table}`)).forEach(
        (row) => {
          targetCharsMap[row.value_] = row.id_;
        }
      );

      const linkDataMap = {};
      Object.values(wordMetaMap).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const source_id_ = source.id_;
          const target_id_ = targetMetaMap[target.value];
          const target_chars_id_ = targetCharsMap[target.chars];
          const weight_ = target.weight || 0;
          const glyph_weight_ = target.glyph_weight || 0;

          if (!target_chars_id_) {
            console.log(
              '读音的字母组合不存在：',
              source.value_,
              JSON.stringify(target)
            );
          }

          const code = source_id_ + ':' + target_id_;
          linkDataMap[code] = {
            source_id_,
            target_id_,
            target_chars_id_,
            weight_,
            glyph_weight_
          };
        });
      });

      const missingLinks = [];
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const id = row.id_;
        const code = row.source_id_ + ':' + row.target_id_;

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

      Object.values(wordMetaMap).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const source_id_ = source.id_;
          const target_id_ = (wordMetaMap[target] || {}).id_;
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

      Object.values(wordMetaMap).forEach((source) => {
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
CREATE TABLE
    IF NOT EXISTS link_phrase_with_zhuyin_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语 id
        source_id_ INTEGER NOT NULL,
        -- 字及其注音关联表 link_word_with_zhuyin 的 id
        target_id_ INTEGER NOT NULL,
        -- 注音字符组合 id
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
        ) REFERENCES link_word_with_zhuyin (id_, target_chars_id_)
    );
CREATE INDEX IF NOT EXISTS idx_lnk_phrs_pywd_chars ON link_phrase_with_pinyin_word (target_spell_chars_id_);
CREATE INDEX IF NOT EXISTS idx_lnk_phrs_zywd_chars ON link_phrase_with_zhuyin_word (target_spell_chars_id_);

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

-- 词及其注音
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
    lnk_.target_index_,
    spell_.value_,
    spell_ch_.value_,
    spell_ch_.id_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN link_phrase_with_zhuyin_word lnk_ on lnk_.source_id_ = phrase_.id_
    --
    LEFT JOIN link_word_with_zhuyin spell_lnk_ on spell_lnk_.id_ = lnk_.target_id_
    LEFT JOIN meta_word word_ on word_.id_ = spell_lnk_.source_id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = spell_lnk_.target_id_
    LEFT JOIN meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = spell_lnk_.target_chars_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    phrase_.index_ asc,
    lnk_.target_index_ asc;
    `
  );

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

  // 绑定读音关联
  await asyncForEach(
    [
      {
        prop: 'pinyins',
        table: 'link_phrase_with_pinyin_word',
        target_table: 'meta_word',
        target_spell_link_table: 'link_word_with_pinyin',
        target_spell_table: 'meta_pinyin',
        target_spell_chars_table: 'meta_pinyin_chars'
      },
      {
        prop: 'zhuyins',
        table: 'link_phrase_with_zhuyin_word',
        target_table: 'meta_word',
        target_spell_link_table: 'link_word_with_zhuyin',
        target_spell_table: 'meta_zhuyin',
        target_spell_chars_table: 'meta_zhuyin_chars'
      }
    ],
    async ({
      prop,
      table,
      target_table,
      target_spell_link_table,
      target_spell_table,
      target_spell_chars_table
    }) => {
      const targetData = {};
      (
        await db.all(
          `SELECT
              ts_lnk_.id_ as id_,
              t_.value_ as value_,
              ts_.id_ as spell_id_,
              ts_.value_ as spell_value_,
              ts_ch_.id_ as spell_chars_id_
          FROM ${target_spell_link_table} ts_lnk_
          INNER JOIN ${target_table} t_ on t_.id_ = ts_lnk_.source_id_
          INNER JOIN ${target_spell_table} ts_ on ts_.id_ = ts_lnk_.target_id_
          INNER JOIN ${target_spell_chars_table} ts_ch_ on ts_ch_.id_ = ts_lnk_.target_chars_id_
          `
        )
      ).forEach((row) => {
        const code = `${row.value_}:${row.spell_value_}`;

        targetData[code] = {
          id_: row.id_,
          spell_id_: row.spell_id_,
          spell_chars_id_: row.spell_chars_id_
        };
      });

      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = `${row.source_id_}:${row.target_id_}:${row.target_index_}`;

        linkData[code] = {
          ...row,
          __exist__: row
        };
      });

      Object.values(phraseMetaMap).forEach((source) => {
        const source_value = source.value_;
        const target_values = source.__meta__.value;
        const target_spell_values = source.__meta__[prop];

        // 字和读音个数不同，则忽略该词组
        if (
          target_values.length !== target_spell_values.length &&
          target_spell_values.length !== 0
        ) {
          console.log(
            `词组 '${source_value}' 的字数与读音数不同(${prop})：${target_spell_values.join(
              ','
            )}`
          );
          return;
        }

        const targets = [];
        for (
          let target_value_index = 0;
          target_value_index < target_values.length;
          target_value_index++
        ) {
          const target_value = target_values[target_value_index];
          const target_spell_value = target_spell_values[target_value_index];

          // 字+读音
          const target_code = `${target_value}:${target_spell_value}`;
          const target = targetData[target_code];

          // 对应读音的字不存在，则直接跳过该词组
          if (!target) {
            console.log(
              `词组 '${source_value}' 中不存在字 '${target_value}(${target_spell_value})': ${target_spell_values.join(
                ','
              )}`
            );
          } else {
            targets.push(target);
          }
        }

        if (targets.length !== target_values.length) {
          return;
        }

        for (
          let target_index = 0;
          target_index < targets.length;
          target_index++
        ) {
          const target = targets[target_index];
          const link_code = `${source.id_}:${target.id_}:${target_index}`;

          if (!linkData[link_code]) {
            // 新增关联
            linkData[link_code] = {
              source_id_: source.id_,
              // 与 字 的读音关联表建立联系
              target_id_: target.id_,
              target_spell_chars_id_: target.spell_chars_id_,
              target_index_: target_index
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
export async function saveEmojis(db, emojiMetas) {
  // 对表情关键字采取按字（非拼音）匹配策略，
  // 仅关键字与查询字相同时才视为匹配上，可做单字或多字匹配
  await execSQL(
    db,
    `
CREATE TABLE
    IF NOT EXISTS meta_emoji (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 表情符号
        value_ TEXT NOT NULL,
        unicode_ TEXT NOT NULL,
        unicode_version_ REAL NOT NULL,
        UNIQUE (value_)
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
    lnk_.target_index_,
    word_.value_,
    word_.id_,
    lnk_.target_word_index_
FROM
    meta_emoji emo_
    --
    LEFT JOIN link_emoji_with_keyword lnk_ on lnk_.source_id_ = emo_.id_
    LEFT JOIN meta_word word_ on word_.id_ = lnk_.target_word_id_
-- Note: group by 不能对组内元素排序，故，只能在视图内先排序
ORDER BY
    lnk_.target_index_ asc,
    lnk_.target_word_index_ asc;
    `
  );

  const emojiMetaMap = emojiMetas.reduce((map, meta) => {
    meta.keywords = meta.keywords.sort();

    const code = meta.value;
    map[code] = {
      __meta__: meta,
      value_: meta.value,
      unicode_: meta.unicode,
      unicode_version_: meta.unicode_version
    };

    return map;
  }, {});

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
  await saveToDB(db, 'meta_emoji', emojiMetaMap);
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
  (
    await db.all('SELECT value_ FROM meta_pinyin_chars ORDER BY value_')
  ).forEach((row) => {
    const value = row.value_;
    values.push(value);
  });

  appendLineToFile(file, values.join('\n'), true);
}

/** 生成拼音字母关联数据 */
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

/** 生成拼音字母后继关联数据 */
export async function generatePinyinNextCharLinks(db, file) {
  const links = {};
  (
    await db.all('SELECT value_ FROM meta_pinyin_chars ORDER BY value_')
  ).forEach((row) => {
    const value = row.value_;
    const chars = splitChars(value);

    if (chars.length > 1) {
      let parent = links;
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
      links[source] = { __is_pinyin__: true };
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
  getKeys(links).forEach((source) => {
    const child = traverse(links, source, 0);
    results.push(child);
  });

  appendLineToFile(file, JSON.stringify({ name: '', children: results }), true);
}
