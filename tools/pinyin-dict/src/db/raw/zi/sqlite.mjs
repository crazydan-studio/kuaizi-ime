import {
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
  fromRootPath('src', 'db/raw/zi/' + name + '.create.sql');

/** 保存拼音和注音信息 */
export function saveSpells(db, ziMetas) {
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
  ].forEach((options) => doSaveSpells(db, ziMetas, options));
}

/** 保存字信息 */
export function saveZies(db, ziMetas) {
  const sqlFile = sql_file_path('table-zi');
  execSQLFile(db, sqlFile);

  // ----------------------------------------------------------------
  const ziMetaData = {};
  const ziRadicalMetaData = {};
  ziMetas.forEach((meta) => {
    ziMetaData[meta.value] = {
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
      ziRadicalMetaData[radical] = {
        value_: radical,
        stroke_count_: meta.radical_stroke_count || 0
      };
    }
  });

  // ----------------------------------------------------------------
  // 保存字部首信息
  const missingZiRadicals = [];
  queryAll(db, 'select * from meta_zi_radical').forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (ziRadicalMetaData[value]) {
      ziRadicalMetaData[value].id_ = id;
      ziRadicalMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingZiRadicals.push(id);
      console.log('部首已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_zi_radical', ziRadicalMetaData);
  removeFromDB(db, 'meta_zi_radical', missingZiRadicals);

  // 获取新增字部首 id
  queryAll(db, 'select id_, value_ from meta_zi_radical').forEach((row) => {
    const value = row.value_;
    ziRadicalMetaData[value].id_ = row.id_;
  });

  // ----------------------------------------------------------------
  // 绑定字与其部首
  Object.keys(ziMetaData).forEach((k) => {
    const zi = ziMetaData[k];
    const radical = zi.__meta__.radical;
    const radical_id_ = (ziRadicalMetaData[radical] || {}).id_;

    if (!radical_id_) {
      console.log('字的部首未保存：', zi.value_, radical);
    }

    zi.radical_id_ = radical_id_;
  });

  // 保存字信息
  const missingZies = [];
  queryAll(db, 'select * from meta_zi').forEach((row) => {
    const id = row.id_;
    const value = row.value_;

    if (ziMetaData[value]) {
      ziMetaData[value].id_ = id;
      ziMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingZies.push(id);
      console.log('字已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_zi', ziMetaData);
  removeFromDB(db, 'meta_zi', missingZies);

  // 获取新增字 id
  queryAll(db, 'select id_, value_ from meta_zi').forEach((row) => {
    const value = row.value_;
    ziMetaData[value].id_ = row.id_;
  });

  // ----------------------------------------------------------------
  // 绑定读音关联
  [
    {
      prop: 'pinyins',
      table: 'meta_zi_with_pinyin',
      spell_meta_table: 'meta_pinyin',
      has_weight: true
      // },
      // {
      //   prop: 'zhuyins',
      //   table: 'meta_zi_with_zhuyin',
      //   spell_meta_table: 'meta_zhuyin',
      //   has_weight: false
    }
  ].forEach((options) => linkZiSpells(db, ziMetaData, options));

  // ----------------------------------------------------------------
  // 绑定字与字的关联
  [
    {
      prop: 'simples',
      table: 'meta_zi_simple'
    },
    {
      prop: 'traditionals',
      table: 'meta_zi_traditional'
      // },
      // {
      //   prop: 'variants',
      //   table: 'meta_zi_variant'
    }
  ].forEach((options) => linkZiVariants(db, ziMetaData, options));

  // // ----------------------------------------------------------------
  // // 绑定字与编码的关联
  // [
  //   {
  //     prop: 'wubi_codes',
  //     table: 'meta_zi_wubi_code'
  //   },
  //   {
  //     prop: 'cangjie_codes',
  //     table: 'meta_zi_cangjie_code'
  //   },
  //   {
  //     prop: 'zhengma_codes',
  //     table: 'meta_zi_zhengma_code'
  //   },
  //   {
  //     prop: 'sijiao_codes',
  //     table: 'meta_zi_sijiao_code'
  //   }
  // ].forEach((options) => linkZiCodes(db, ziMetaData, options));
}

function doSaveSpells(db, ziMetas, { prop, table, chars_table, chars_fn }) {
  const spellMetaData = {};
  const charsMetaData = {};

  ziMetas.forEach((ziMeta) => {
    const spells = ziMeta[prop];

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

function linkZiSpells(
  db,
  ziMetaData,
  { prop, table, spell_meta_table, has_weight }
) {
  const spellMetaMap = {};
  queryAll(db, `select id_, value_ from ${spell_meta_table}`).forEach((row) => {
    spellMetaMap[row.value_] = row.id_;
  });

  const ziIdMap = {};
  const spellIdMap = {};

  const spellType = has_weight ? '拼音' : '注音';
  const linkDataMap = {};
  Object.keys(ziMetaData).forEach((k) => {
    const zi = ziMetaData[k];
    const spells = zi.__meta__[prop];

    const zi_id_ = zi.id_;
    ziIdMap[zi_id_] = k;

    spells.forEach((spell) => {
      const spell_id_ = spellMetaMap[spell.value];
      spellIdMap[spell_id_] = spell.value;

      const code = zi_id_ + ':' + spell_id_;
      const data = (linkDataMap[code] = {
        zi_id_,
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
    const code = row.zi_id_ + ':' + row.spell_id_;

    if (linkDataMap[code]) {
      linkDataMap[code].id_ = id;
      linkDataMap[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingLinks.push(id);
      console.log(
        spellType + '字已被废弃：',
        id,
        ziIdMap[row.zi_id_] || '',
        spellIdMap[row.spell_id_] || ''
      );
    }
  });

  saveToDB(db, table, linkDataMap);
  removeFromDB(db, table, missingLinks);
}

function linkZiVariants(db, ziMetaData, { prop, table }) {
  const primaryKeys = ['source_id_', 'target_id_'];

  const linkData = {};
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const code = row.source_id_ + ':' + row.target_id_;
    linkData[code] = {
      ...row,
      __exist__: row
    };
  });

  Object.keys(ziMetaData).forEach((k) => {
    const zi = ziMetaData[k];
    const variants = zi.__meta__[prop];

    variants.forEach((variant) => {
      const source_id_ = zi.id_;
      const target_id_ = (ziMetaData[variant] || {}).id_;
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

function linkZiCodes(db, ziMetaData, { prop, table }) {
  const linkData = {};
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const code = row.value_ + ':' + row.zi_id_;
    linkData[code] = {
      ...row,
      __exist__: row
    };
  });

  Object.keys(ziMetaData).forEach((k) => {
    const zi = ziMetaData[k];
    const codes = zi.__meta__[prop];

    codes.forEach((value_) => {
      const zi_id_ = zi.id_;
      const code = value_ + ':' + zi_id_;

      if (!linkData[code]) {
        // 新增关联
        linkData[code] = {
          value_,
          zi_id_
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
