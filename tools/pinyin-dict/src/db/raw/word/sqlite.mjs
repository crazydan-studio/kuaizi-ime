import {
  splitChars,
  appendLineToFile,
  fromRootPath,
  extractPinyinChars,
  extractZhuyinChars
} from '#utils/utils.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'db/raw/word/' + name + '.create.sql');

/** 保存拼音和注音信息 */
export function saveSpells(db, wordMetas) {
  const sqlFile = sql_file_path('table-spell');
  execSQLFile(db, sqlFile);

  [
    {
      prop: 'pinyins',
      table: 'meta_pinyin',
      chars_table: 'meta_pinyin_chars',
      chars_fn: extractPinyinChars
    },
    {
      prop: 'zhuyins',
      table: 'meta_zhuyin',
      chars_table: 'meta_zhuyin_chars',
      chars_fn: extractZhuyinChars
    }
  ].forEach((options) => doSaveSpells(db, wordMetas, options));
}

/** 保存字信息 */
export function saveWords(db, wordMetas) {
  const sqlFile = sql_file_path('table-word');
  execSQLFile(db, sqlFile);

  // ----------------------------------------------------------------
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
      traditional_: meta.traditional ? 1 : 0,
      glyph_weight_: meta.glyph_weight || 0
    };

    const radical = meta.radical;
    if (radical) {
      wordRadicalMetaData[radical] = {
        value_: radical,
        stroke_count_: meta.radical_stroke_count || 0
      };
    }
  });

  // ----------------------------------------------------------------
  // 保存字部首信息
  const missingWordRadicals = [];
  queryAll(db, 'select * from meta_word_radical').forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (wordRadicalMetaData[value]) {
      wordRadicalMetaData[value].id_ = id;
      wordRadicalMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingWordRadicals.push(id);
      console.log('部首已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_word_radical', wordRadicalMetaData);
  removeFromDB(db, 'meta_word_radical', missingWordRadicals);

  // 获取新增字部首 id
  queryAll(db, 'select id_, value_ from meta_word_radical').forEach((row) => {
    const value = row.value_;
    wordRadicalMetaData[value].id_ = row.id_;
  });

  // ----------------------------------------------------------------
  // 绑定字与其部首
  Object.keys(wordMetaData).forEach((k) => {
    const word = wordMetaData[k];
    const radical = word.__meta__.radical;
    const radical_id_ = (wordRadicalMetaData[radical] || {}).id_;

    if (!radical_id_) {
      console.log('字的部首未保存：', word.value_, radical);
    }

    word.radical_id_ = radical_id_;
  });

  // 保存字信息
  const missingWords = [];
  queryAll(db, 'select * from meta_word').forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (wordMetaData[value]) {
      wordMetaData[value].id_ = id;
      wordMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingWords.push(id);
      console.log('字已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_word', wordMetaData);
  removeFromDB(db, 'meta_word', missingWords);

  // 获取新增字 id
  queryAll(db, 'select id_, value_ from meta_word').forEach((row) => {
    const value = row.value_;
    wordMetaData[value].id_ = row.id_;
  });

  // ----------------------------------------------------------------
  // 绑定读音关联
  [
    {
      prop: 'pinyins',
      table: 'meta_word_with_pinyin',
      spell_meta_table: 'meta_pinyin',
      has_weight: true
    },
    {
      prop: 'zhuyins',
      table: 'meta_word_with_zhuyin',
      spell_meta_table: 'meta_zhuyin',
      has_weight: false
    }
  ].forEach((options) => linkWordSpells(db, wordMetaData, options));

  // ----------------------------------------------------------------
  // 绑定字与字的关联
  [
    {
      prop: 'simple_words',
      table: 'meta_word_simple'
    },
    {
      prop: 'traditional_words',
      table: 'meta_word_traditional'
    },
    {
      prop: 'variant_words',
      table: 'meta_word_variant'
    }
  ].forEach((options) => linkWordVariants(db, wordMetaData, options));

  // ----------------------------------------------------------------
  // 绑定字与编码的关联
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
  ].forEach((options) => linkWordCodes(db, wordMetaData, options));
}

/** 生成拼音字母组合数据 */
export function generatePinyinChars(db, file) {
  const values = [];
  const nextCharsMap = {};

  queryAll(db, 'select value_ from meta_pinyin_chars order by value_').forEach(
    (row) => {
      const value = row.value_;
      values.push(value);

      const nextChars =
        value.charAt(1) === 'h' ? value.substring(2) : value.substring(1);
      nextChars && (nextCharsMap[nextChars] = true);
    }
  );

  console.log(
    '- 后继字母列表: ',
    JSON.stringify(Object.keys(nextCharsMap).sort())
  );

  appendLineToFile(file, values.join('\n'), true);
}

/** 生成拼音字母的连接数据 */
export function generatePinyinCharLinks(db, file) {
  const links = {};
  queryAll(db, 'select value_ from meta_pinyin_chars order by value_').forEach(
    (row) => {
      const value = row.value_;
      const chars = splitChars(value);

      if (chars.length > 1) {
        for (let i = 1; i < chars.length; i++) {
          const source = chars[i - 1];
          const target = chars[i];

          (links[source] ||= {})[target] = true;
        }
      }
    }
  );

  const results = [];
  Object.keys(links).forEach((source) => {
    Object.keys(links[source]).forEach((target) => {
      results.push({ source, target });
    });
  });

  appendLineToFile(file, JSON.stringify(results), true);
}

/** 生成拼音字母后继树数据 */
export function generatePinyinCharTree(db, file) {
  const tree = {};
  queryAll(db, 'select value_ from meta_pinyin_chars order by value_').forEach(
    (row) => {
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
    }
  );

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

function doSaveSpells(db, wordMetas, { prop, table, chars_table, chars_fn }) {
  const spellMetaData = {};
  const charsMetaData = {};

  wordMetas.forEach((wordMeta) => {
    const spells = wordMeta[prop];

    spells.forEach(({ value }) => {
      if (!value || spellMetaData[value]) {
        return;
      }

      const chars = chars_fn(value);
      spellMetaData[value] = {
        __chars__: chars,
        value_: value
      };
      charsMetaData[chars] = { value_: chars };
    });
  });

  // ----------------------------------------------------------------
  const missingCharsMetas = [];
  queryAll(db, `select * from ${chars_table}`).forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (charsMetaData[value]) {
      charsMetaData[value].id_ = id;
      charsMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingCharsMetas.push(id);
      console.log('字母组合已被废弃：', value, id);
    }
  });
  saveToDB(db, chars_table, charsMetaData);
  removeFromDB(db, chars_table, missingCharsMetas);

  // 获取新增字符组合 id
  queryAll(db, `select id_, value_ from ${chars_table}`).forEach((row) => {
    const value = row.value_;
    charsMetaData[value].id_ = row.id_;
  });

  // ----------------------------------------------------------------
  // 绑定读音与其字符组合
  Object.keys(spellMetaData).forEach((k) => {
    const spell = spellMetaData[k];
    const chars_id_ = (charsMetaData[spell.__chars__] || {}).id_;

    if (!chars_id_) {
      console.log('读音的字母组合未保存：', spell.value_, spell.__chars__);
    }

    spell.chars_id_ = chars_id_;
  });

  const missingSpellMetas = [];
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (spellMetaData[value]) {
      spellMetaData[value].id_ = id;
      spellMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingSpellMetas.push(id);
      console.log('读音已被废弃：', value, id);
    }
  });

  saveToDB(db, table, spellMetaData);
  removeFromDB(db, table, missingSpellMetas);
}

function linkWordSpells(
  db,
  wordMetaData,
  { prop, table, spell_meta_table, has_weight }
) {
  const spellMetaMap = {};
  queryAll(db, `select id_, value_ from ${spell_meta_table}`).forEach((row) => {
    spellMetaMap[row.value_] = row.id_;
  });

  const wordIdMap = {};
  const spellIdMap = {};

  const spellType = has_weight ? '拼音' : '注音';
  const linkDataMap = {};
  Object.keys(wordMetaData).forEach((k) => {
    const word = wordMetaData[k];
    const spells = word.__meta__[prop];

    const word_id_ = word.id_;
    wordIdMap[word_id_] = k;

    spells.forEach((spell) => {
      const spell_id_ = spellMetaMap[spell.value];
      spellIdMap[spell_id_] = spell.value;

      const code = word_id_ + ':' + spell_id_;
      const data = (linkDataMap[code] = {
        word_id_,
        spell_id_
      });

      if (has_weight) {
        data.used_weight_ = spell.used_weight || 0;
      }
    });
  });

  const missingLinks = [];
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const id = row.id_;
    const code = row.word_id_ + ':' + row.spell_id_;

    if (linkDataMap[code]) {
      linkDataMap[code].id_ = id;
      linkDataMap[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingLinks.push(id);
      console.log(
        spellType + '字已被废弃：',
        id,
        wordIdMap[row.word_id_] || '',
        spellIdMap[row.spell_id_] || ''
      );
    }
  });

  saveToDB(db, table, linkDataMap);
  removeFromDB(db, table, missingLinks);
}

function linkWordVariants(db, wordMetaData, { prop, table }) {
  const primaryKeys = ['source_id_', 'target_id_'];

  const linkData = {};
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const code = row.source_id_ + ':' + row.target_id_;
    linkData[code] = {
      ...row,
      __exist__: row
    };
  });

  Object.keys(wordMetaData).forEach((k) => {
    const word = wordMetaData[k];
    const variants = word.__meta__[prop];

    variants.forEach((variant) => {
      const source_id_ = word.id_;
      const target_id_ = (wordMetaData[variant] || {}).id_;
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
    const data = linkData[code];

    if (data.__exist__) {
      // 关联在库中已存在，但已不再被使用
      missingLinks.push(data);

      delete linkData[code];
    }
  });

  saveToDB(db, table, linkData, true, primaryKeys);
  removeFromDB(db, table, missingLinks, primaryKeys);
}

function linkWordCodes(db, wordMetaData, { prop, table }) {
  const linkData = {};
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const code = row.value_ + ':' + row.word_id_;
    linkData[code] = {
      ...row,
      __exist__: row
    };
  });

  Object.keys(wordMetaData).forEach((k) => {
    const word = wordMetaData[k];
    const codes = word.__meta__[prop];

    codes.forEach((value_) => {
      const word_id_ = word.id_;
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
      // 关联在库中已存在，但已不再被使用
      missingLinks.push(id);

      delete linkData[code];
    }
  });

  saveToDB(db, table, linkData);
  removeFromDB(db, table, missingLinks);
}
