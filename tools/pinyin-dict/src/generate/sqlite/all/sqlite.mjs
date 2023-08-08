import { splitChars } from '../../../utils/utils.mjs';
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
-- 含声调的拼音
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
-- 不含声调的注音字符组合
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
        glyph_struct_ TEXT DEFAULT '',
        radical_ TEXT DEFAULT '',
        stroke_order_ TEXT DEFAULT '',
        total_stroke_count_ INTEGER DEFAULT 0,
        radical_stroke_count_ INTEGER DEFAULT 0,
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
CREATE TABLE
    IF NOT EXISTS link_word_with_zhuyin (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 字 id
        source_id_ INTEGER NOT NULL,
        -- 注音 id
        target_id_ INTEGER NOT NULL,
        -- 注音字符组合 id
        target_chars_id_ INTEGER NOT NULL,
        -- 按使用频率等排序的权重
        weight_ INTEGER DEFAULT 0,
        UNIQUE (source_id_, target_id_),
        FOREIGN KEY (source_id_) REFERENCES meta_word (id_),
        FOREIGN KEY (target_id_) REFERENCES meta_zhuyin (id_),
        FOREIGN KEY (target_chars_id_) REFERENCES meta_zhuyin_chars (id_)
    );

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
        value_,
        unicode_,
        weight_,
        spell_,
        spell_weight_,
        spell_chars_,
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
    word_.id_,
    word_.value_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    lnk_.weight_,
    spell_ch_.value_,
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
        value_,
        unicode_,
        weight_,
        spell_,
        spell_weight_,
        spell_chars_,
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
    word_.id_,
    word_.value_,
    word_.unicode_,
    word_.weight_,
    spell_.value_,
    lnk_.weight_,
    spell_ch_.value_,
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
    const value = row.value_;
    const id = row.id_;

    if (wordMetaMap[value]) {
      wordMetaMap[value].id_ = id;
      wordMetaMap[value].__exist__ = row;
    } else {
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
      const linkData = {};
      (await db.all(`SELECT * FROM ${table}`)).forEach((row) => {
        const code = row.source_id_ + ':' + row.target_id_;

        linkData[code] = {
          __exist__: row,
          id_: row.id_,
          source_id_: row.source_id_,
          target_id_: row.target_id_,
          target_chars_id_: row.target_chars_id_,
          weight_: row.weight_
        };
      });

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

      Object.values(wordMetaMap).forEach((source) => {
        source.__meta__[prop].forEach((target) => {
          const source_id_ = source.id_;
          const target_id_ = targetMetaMap[target.value];
          const target_chars_id_ = targetCharsMap[target.chars];
          const weight_ = target.weight || 0;

          if (!target_chars_id_) {
            console.log('拼音的字母组合不存在：', source.value_, target);
          }

          const code = source_id_ + ':' + target_id_;
          if (!linkData[code]) {
            // 新增关联
            linkData[code] = {
              source_id_,
              target_id_,
              target_chars_id_,
              weight_
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
          __exist__: row,
          id_: row.id_,
          source_id_: row.source_id_,
          target_id_: row.target_id_
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
          __exist__: row,
          id_: row.id_,
          value_: row.value_,
          word_id_: row.word_id_
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
        -- 字 id
        target_id_ INTEGER NOT NULL,
        -- 拼音 id
        target_spell_id_ INTEGER NOT NULL,
        -- 拼音字母组合 id
        target_spell_chars_id_ INTEGER NOT NULL,
        -- 字在词中的序号
        target_index_ INTEGER NOT NULL,
        UNIQUE (
            source_id_,
            target_id_,
            target_spell_id_,
            target_index_
        ),
        FOREIGN KEY (source_id_) REFERENCES meta_phrase (id_),
        FOREIGN KEY (
            target_id_,
            target_spell_id_,
            target_spell_chars_id_
        ) REFERENCES link_word_with_pinyin (source_id_, target_id_, target_chars_id_)
    );
CREATE TABLE
    IF NOT EXISTS link_phrase_with_zhuyin_word (
        id_ INTEGER NOT NULL PRIMARY KEY,
        -- 短语 id
        source_id_ INTEGER NOT NULL,
        -- 字 id
        target_id_ INTEGER NOT NULL,
        -- 注音 id
        target_spell_id_ INTEGER NOT NULL,
        -- 注音字符组合 id
        target_spell_chars_id_ INTEGER NOT NULL,
        -- 字在词中的序号
        target_index_ INTEGER NOT NULL,
        UNIQUE (
            source_id_,
            target_id_,
            target_spell_id_,
            target_index_
        ),
        FOREIGN KEY (source_id_) REFERENCES meta_phrase (id_),
        FOREIGN KEY (
            target_id_,
            target_spell_id_,
            target_spell_chars_id_
        ) REFERENCES link_word_with_zhuyin (source_id_, target_id_, target_chars_id_)
    );

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
        word_spell_chars_
    ) AS
SELECT
    phrase_.id_,
    phrase_.value_,
    phrase_.index_,
    phrase_.weight_,
    word_.value_,
    lnk_.target_index_,
    spell_.value_,
    spell_ch_.value_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN link_phrase_with_pinyin_word lnk_ on lnk_.source_id_ = phrase_.id_
    LEFT JOIN meta_word word_ on word_.id_ = lnk_.target_id_
    LEFT JOIN meta_pinyin spell_ on spell_.id_ = lnk_.target_spell_id_
    LEFT JOIN meta_pinyin_chars spell_ch_ on spell_ch_.id_ = lnk_.target_spell_chars_id_
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
        word_spell_chars_
    ) AS
SELECT
    phrase_.id_,
    phrase_.value_,
    phrase_.index_,
    phrase_.weight_,
    word_.value_,
    lnk_.target_index_,
    spell_.value_,
    spell_ch_.value_
FROM
    meta_phrase phrase_
    --
    LEFT JOIN link_phrase_with_zhuyin_word lnk_ on lnk_.source_id_ = phrase_.id_
    LEFT JOIN meta_word word_ on word_.id_ = lnk_.target_id_
    LEFT JOIN meta_zhuyin spell_ on spell_.id_ = lnk_.target_spell_id_
    LEFT JOIN meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = lnk_.target_spell_chars_id_
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
              t_.id_ as id_,
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
        const code = `${row.source_id_}:${row.target_id_}:${row.target_spell_id_}:${row.target_index_}`;

        linkData[code] = {
          __exist__: row,
          id_: row.id_,
          source_id_: row.source_id_,
          target_id_: row.target_id_,
          target_spell_id_: row.target_spell_id_,
          target_spell_chars_id_: row.target_spell_chars_id_,
          target_index_: row.target_index_
        };
      });

      Object.values(phraseMetaMap).forEach((source) => {
        const source_value = source.value_;
        const target_values = source.__meta__.value;
        const spell_values = source.__meta__[prop];

        // 字和读音个数不同，则忽略该词组
        if (
          target_values.length !== spell_values.length &&
          spell_values.length !== 0
        ) {
          console.log(
            `词组 '${source_value}' 的字数与读音数不同(${prop})：${spell_values.join(
              ','
            )}`
          );
          return;
        }

        const targets = [];
        for (let index = 0; index < target_values.length; index++) {
          const target_value = target_values[index];
          const spell_value = spell_values[index];
          const target_code = `${target_value}:${spell_value}`;
          const target = targetData[target_code];

          // 对应读音的字不存在，则直接跳过该词组
          if (!target) {
            console.log(
              `词组 '${source_value}' 中不存在字 '${target_value}(${spell_value})': ${spell_values.join(
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

        for (let index = 0; index < targets.length; index++) {
          const target = targets[index];
          const link_code = `${source.id_}:${target.id_}:${target.spell_id_}:${index}`;

          if (!linkData[link_code]) {
            // 新增关联
            linkData[link_code] = {
              source_id_: source.id_,
              target_id_: target.id_,
              target_spell_id_: target.spell_id_,
              target_spell_chars_id_: target.spell_chars_id_,
              target_index_: index
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
export async function saveEmotions(db, emotionMetas) {
  // 对表情关键字采取按字（非拼音）匹配策略，
  // 仅关键字与查询字相同时才视为匹配上，可做单字或多字匹配
  await execSQL(
    db,
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

-- 表情及其关键字
CREATE VIEW
    IF NOT EXISTS emotion (
        id_,
        value_,
        keyword_index_,
        keyword_word_,
        keyword_word_index_
    ) AS
SELECT
    emo_.id_,
    emo_.value_,
    lnk_.target_index_,
    word_.value_,
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

  const emotionMetaMap = emotionMetas.reduce((map, meta) => {
    meta.keywords = meta.keywords.sort();

    const code = meta.value;
    map[code] = {
      __meta__: meta,
      value_: meta.value
    };

    return map;
  }, {});

  // 保存表情信息
  const missingPhrases = [];
  (await db.all('SELECT * FROM meta_emotion')).forEach((row) => {
    const code = row.value_;
    const id = row.id_;

    if (emotionMetaMap[code]) {
      emotionMetaMap[code].id_ = id;
      emotionMetaMap[code].__exist__ = row;
    } else {
      missingPhrases.push(id);
    }
  });
  await saveToDB(db, 'meta_emotion', emotionMetaMap);
  await removeFromDB(db, 'meta_emotion', missingPhrases);

  // 获取新增表情 id
  (await db.all('SELECT id_, value_ FROM meta_emotion')).forEach((row) => {
    const code = row.value_;
    emotionMetaMap[code].id_ = row.id_;
  });

  // 绑定关键字关联
  await asyncForEach(
    [
      {
        table: 'link_emotion_with_keyword',
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
          __exist__: row,
          id_: row.id_,
          source_id_: row.source_id_,
          target_index_: row.target_index_,
          target_word_id_: row.target_word_id_,
          target_word_index_: row.target_word_index_
        };
      });

      Object.values(emotionMetaMap).forEach((source) => {
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