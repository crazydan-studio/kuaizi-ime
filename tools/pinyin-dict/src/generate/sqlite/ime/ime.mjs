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

/** 同步字信息 */
export async function syncWords(imeDB, rawDB) {
  await execSQL(
    imeDB,
    `
  -- 拼音字母组合
  create table
    if not exists meta_pinyin_chars (
      id_ integer not null primary key,
      value_ text not null
      -- , unique (value_)
    );

  -- 在一张表中记录拼音字的全部信息，从而降低数据库文件大小，同时消除表连接以提升查询性能
  create table
    if not exists pinyin_word (
      id_ integer not null primary key,
      -- 字
      word_ text not null,
      word_id_ integer not null,
      -- 拼音
      spell_ text not null,
      spell_id_ integer not null,
      spell_chars_id_ integer not null,
      -- 字使用权重
      used_weight_ integer default 0,
      -- 按拼音分组计算的字形权重
      glyph_weight_ integer default 0,
      -- 部首
      radical_ text default null,
      radical_stroke_count_ integer default 0,
      -- 当前拼音字的繁/简字及其 id（对应 pinyin_word 表的 id_）
      variant_ text default null,
      variant_id_ integer default null,
      traditional_ integer default 0
    );
`
  );
  await syncTableData(imeDB, rawDB, ['meta_pinyin_chars']);

  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  const dataInRawDB = {};
  (
    await rawDB.all(
      `
      select
        lnk_.id_ as id_,
        word_.value_ as word_,
        word_.id_ as word_id_,
        spell_.value_ as spell_,
        spell_.id_ as spell_id_,
        spell_.chars_id_ as spell_chars_id_,
        word_.used_weight_ as used_weight_,
        lnk_.glyph_weight_ as glyph_weight_,
        word_.traditional_ as traditional_,
        radical_.value_ as radical_,
        radical_.stroke_count_ as radical_stroke_count_,
        -- 提供字段占位，以确保做更新检查时，数据中已包含全部的字段
        null as variant_,
        null as variant_id_
      from
        meta_word_with_pinyin lnk_
        inner join meta_word word_ on word_.id_ = lnk_.word_id_
        inner join meta_pinyin spell_ on spell_.id_ = lnk_.spell_id_
        inner join meta_word_radical radical_ on radical_.id_ = word_.radical_id_
      `
    )
  ).forEach((row) => {
    dataInRawDB[row.id_] = row;
  });
  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  // 绑定各个拼音字的繁/简体，且繁/简体的读音需相同
  const pinyinWords = {};
  Object.keys(dataInRawDB).forEach((id) => {
    const raw = dataInRawDB[id];

    pinyinWords[raw.word_id_] ||= [];
    pinyinWords[raw.word_id_].push(raw);
  });

  const words = {};
  (await rawDB.all(`select * from meta_word`)).forEach((row) => {
    words[row.id_] = row;
  });
  const getWord = (id) => words[id].value_;

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
    if ((pinyinWords[row.source_id_] || []).length == 0) {
      console.log(
        `字 ${getWord(row.source_id_)}:${row.source_id_} 没有拼音信息`
      );
      return;
    }
    if ((pinyinWords[row.target_id_] || []).length == 0) {
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

  Object.keys(variantWords).forEach((source_id_) => {
    const { target_id_ } = variantWords[source_id_];

    const sources = pinyinWords[source_id_];
    const targets = pinyinWords[target_id_];

    sources.forEach((source) => {
      const exist = targets.filter(
        (target) => target.spell_id_ == source.spell_id_
      )[0];

      if (!exist) {
        console.log(
          `拼音字 ${source.id_}:${source.word_}:${
            source.spell_
          } 没有相同读音的繁/简体：${targets[0].word_}:${targets
            .map((t) => t.spell_)
            .join(',')}`
        );
        return;
      }

      // 绑定繁/简体的拼音字
      source.variant_ = exist.word_;
      source.variant_id_ = exist.id_;
    });
  });
  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

  const dataInImeDB = {};
  const missingDataInImeDB = [];
  (await imeDB.all(`select * from pinyin_word`)).forEach((row) => {
    const id = row.id_;
    const raw = dataInRawDB[id];

    if (raw) {
      // 待更新
      dataInImeDB[id] = {
        ...raw,
        __exist__: row
      };

      // Note: 在原始数据中仅保留待新增的
      delete dataInRawDB[id];
    } else {
      // 待删除
      missingDataInImeDB.push(id);
    }
  });

  // 添加新数据
  await saveToDB(imeDB, 'pinyin_word', dataInRawDB);
  // 更新已存在数据
  await saveToDB(imeDB, 'pinyin_word', dataInImeDB);
  // 删除多余数据
  await removeFromDB(imeDB, 'pinyin_word', missingDataInImeDB);
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
