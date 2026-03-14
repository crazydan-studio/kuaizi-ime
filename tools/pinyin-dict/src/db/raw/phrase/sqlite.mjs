import { fromRootPath } from '#utils/utils.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'db/raw/phrase/' + name + '.create.sql');

/** 保存词组信息 */
export function savePhrases(db, wordMetas) {
  const sqlFile = sql_file_path('table-phrase');
  execSQLFile(db, sqlFile);

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
  queryAll(db, 'select * from meta_phrase').forEach((row) => {
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
  saveToDB(db, 'meta_phrase', phraseMetaMap);
  removeFromDB(db, 'meta_phrase', missingPhrases);

  // 获取新增短语 id
  queryAll(db, 'select id_, value_, index_ from meta_phrase').forEach((row) => {
    const value = row.value_;
    const code = `${value}:${row.index_}`;

    phraseMetaMap[code].id_ = row.id_;
  });

  // ================================================================
  // 绑定读音关联
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
  ].forEach(
    ({ prop, table, word_table, word_spell_link_table, word_spell_table }) => {
      // ================================================================
      const wordData = {};
      queryAll(
        db,
        `select
            ws_lnk_.id_ as id_,
            w_.value_ as value_,
            ws_.value_ as spell_value_
          from ${word_spell_link_table} ws_lnk_
          inner join ${word_table} w_ on w_.id_ = ws_lnk_.word_id_
          inner join ${word_spell_table} ws_ on ws_.id_ = ws_lnk_.spell_id_
          `
      ).forEach((row) => {
        const code = `${row.value_}:${row.spell_value_}`;

        wordData[code] = {
          id_: row.id_
        };
      });

      const linkData = {};
      queryAll(db, `select * from ${table}`).forEach((row) => {
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
          // 关联在库中已存在，但未使用
          missingLinks.push(id);

          delete linkData[code];
        }
      });

      saveToDB(db, table, linkData);
      removeFromDB(db, table, missingLinks);
    }
  );
}
