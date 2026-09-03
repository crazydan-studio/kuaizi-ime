import { fromRootPath } from '#utils/file.mjs';
import {
  calcPinyinId,
  zeroPinyinTone,
  getPinyinTone,
  PINYIN_ID_UPPER_LIMIT
} from '#utils/spell.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';
import { getUnicode, fromUnicode, getStructureCode } from '#utils/zi.mjs';

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
      id_fn: calcPinyinId,
      tone_zero_fn: zeroPinyinTone,
      tone_get_fn: getPinyinTone
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
    const zi = meta.value;
    const zi_id = getUnicode(zi);

    ziMetaData[zi] = {
      __meta__: meta,
      id_: zi_id,
      glyph_struct_: getStructureCode(meta.glyph_struct),
      stroke_order_: meta.stroke_order,
      total_stroke_count_: meta.total_stroke_count,
      traditional_: meta.traditional ? 1 : 0,
      glyph_weight_: meta.glyph_weight || 0
    };

    const radical = meta.radical;
    if (radical) {
      const radical_id = getUnicode(radical);

      ziRadicalMetaData[radical] = {
        id_: radical_id,
        stroke_count_: meta.radical_stroke_count || 0
      };

      ziMetaData[zi].radical_id_ = radical_id;
    }
  });

  // ----------------------------------------------------------------
  // 保存字部首信息
  const missingZiRadicals = [];
  queryAll(db, 'select * from meta_zi_radical').forEach((row) => {
    const id = row.id_;
    const value = fromUnicode(id);

    if (ziRadicalMetaData[value]) {
      ziRadicalMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingZiRadicals.push(id);

      console.log('部首已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_zi_radical', ziRadicalMetaData, false);
  removeFromDB(db, 'meta_zi_radical', missingZiRadicals);

  // 保存字信息
  const missingZies = [];
  queryAll(db, 'select * from meta_zi').forEach((row) => {
    const id = row.id_;
    const value = fromUnicode(id);

    if (ziMetaData[value]) {
      ziMetaData[value].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingZies.push(id);

      console.log('字已被废弃：', value, id);
    }
  });
  saveToDB(db, 'meta_zi', ziMetaData, false);
  removeFromDB(db, 'meta_zi', missingZies);

  // ----------------------------------------------------------------
  // 绑定读音关联
  [
    {
      prop: 'pinyins',
      table: 'meta_zi_with_pinyin',
      //
      spell_used_weights_prop: 'pinyin_used_weights',
      spell_id_fn: calcPinyinId
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
    }
  ].forEach((options) => linkZiVariants(db, ziMetaData, options));
}

function doSaveSpells(
  db,
  ziMetas,
  { prop, table, id_fn, tone_zero_fn, tone_get_fn }
) {
  const spellMetaData = {};

  ziMetas.forEach((ziMeta) => {
    const spells = ziMeta[prop];

    spells.forEach((value) => {
      if (!value || spellMetaData[value]) {
        return;
      }

      const id_ = id_fn(value);
      const value_ = tone_zero_fn(value);
      const tone_ = tone_get_fn(value);

      const code = `${value_}:${tone_}`;
      spellMetaData[code] = {
        id_,
        value_,
        tone_,
        raw_: value
      };
    });
  });

  // ----------------------------------------------------------------
  const missingSpellMetas = [];
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const id = row.id_;
    const value = row.value_;
    const tone = row.tone_;

    const code = `${value}:${tone}`;

    if (spellMetaData[code]) {
      spellMetaData[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingSpellMetas.push(id);

      console.log('读音已被废弃：', row.raw_, code, id);
    }
  });

  saveToDB(db, table, spellMetaData, false);
  removeFromDB(db, table, missingSpellMetas);
}

function linkZiSpells(
  db,
  ziMetaData,
  { prop, table, spell_id_fn, spell_used_weights_prop }
) {
  const ziIdMap = {};
  const spellIdMap = {};

  const spellType = spell_used_weights_prop ? '拼音' : '注音';
  const linkDataMap = {};
  Object.keys(ziMetaData).forEach((k) => {
    const zi = ziMetaData[k];
    const spells = zi.__meta__[prop];
    const spell_used_weights = zi.__meta__[spell_used_weights_prop] || {};

    const zi_id_ = zi.id_;
    ziIdMap[zi_id_] = k;

    spells.forEach((spell) => {
      const spell_id_ = spell_id_fn(spell);
      spellIdMap[spell_id_] = spell;

      const code = zi_id_ + ':' + spell_id_;
      linkDataMap[code] = {
        zi_id_,
        spell_id_,
        used_weight_: spell_used_weights[spell] || 0
      };
    });
  });

  const linkPrimaryKeys = ['zi_id_', 'spell_id_'];
  const missingLinks = [];
  queryAll(db, `select * from ${table}`).forEach((row) => {
    const code = row.zi_id_ + ':' + row.spell_id_;

    if (linkDataMap[code]) {
      linkDataMap[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingLinks.push(row);

      console.log(
        `${spellType}字已被废弃：`,
        row.id_,
        ziIdMap[row.zi_id_] || '',
        spellIdMap[row.spell_id_] || ''
      );
    }
  });

  saveToDB(db, table, linkDataMap, true, linkPrimaryKeys);
  removeFromDB(db, table, missingLinks, linkPrimaryKeys);
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

/** 计算拼音字 id：{字 id} * {拼音 id 上限} + {拼音 id} */
function calcPinyinZiLinkId(ziId, pyId) {
  return ziId * PINYIN_ID_UPPER_LIMIT + pyId;
}
