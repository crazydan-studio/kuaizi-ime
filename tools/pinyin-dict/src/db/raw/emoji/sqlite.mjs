import { fromRootPath } from '#utils/utils.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'db/raw/emoji/' + name + '.create.sql');

/** 保存表情符号 */
export function saveEmojis(db, groupEmojiMetas) {
  // 对表情关键字采取按字（非拼音）匹配策略，
  // 仅关键字与查询字相同时才视为匹配上，可做单字或多字匹配
  const sqlFile = sql_file_path('table-emoji');
  execSQLFile(db, sqlFile);

  const keywordWordData = {};
  queryAll(db, `select id_, value_ from meta_word`).forEach((row) => {
    const code = row.value_;

    keywordWordData[code] = {
      id_: row.id_,
      value_: row.value_
    };
  });

  const emojiGroupMap = Object.keys(groupEmojiMetas).reduce((map, group) => {
    map[group] = { value_: group };

    return map;
  }, {});

  // 保存表情分组信息
  const missingEmojiGroups = [];
  queryAll(db, 'select * from meta_emoji_group').forEach((row) => {
    const id = row.id_;
    const code = row.value_;

    if (emojiGroupMap[code]) {
      emojiGroupMap[code].id_ = id;
      emojiGroupMap[code].__exist__ = row;
    } else {
      missingEmojiGroups.push(id);
    }
  });
  saveToDB(db, 'meta_emoji_group', emojiGroupMap);
  removeFromDB(db, 'meta_emoji_group', missingEmojiGroups);

  // 获取新增表情分组 id
  queryAll(db, 'select * from meta_emoji_group').forEach((row) => {
    const code = row.value_;

    emojiGroupMap[code].id_ = row.id_;
  });

  const emojiMetaMap = {};
  Object.keys(groupEmojiMetas).forEach((group) => {
    groupEmojiMetas[group].forEach((meta) => {
      meta.keywords = meta.keywords.sort();

      const keyword_ids_list = [];
      meta.keywords.forEach((keyword_value) => {
        const keywords = splitChars(keyword_value);
        const keyword_ids = [];

        keywords.forEach((keyword) => {
          const keyword_id = (keywordWordData[keyword] || {}).id_;

          if (keyword_id) {
            keyword_ids.push(keyword_id);
          } else {
            console.log(
              `表情 '${meta.value}' 的关键字 '${keyword_value}' 不存在字 '${keyword}'`
            );
          }
        });

        if (keyword_ids.length === 0) {
          return;
        }

        keyword_ids_list.push(keyword_ids);
      });

      const code = meta.value;
      emojiMetaMap[code] = {
        __meta__: meta,
        value_: meta.value,
        unicode_: meta.unicode,
        unicode_version_: meta.unicode_version,
        group_id_: emojiGroupMap[group].id_,
        keyword_ids_list_: JSON.stringify(keyword_ids_list)
      };
    });
  });

  // 保存表情信息
  const missingEmojis = [];
  queryAll(db, 'select * from meta_emoji').forEach((row) => {
    const id = row.id_;
    const code = row.value_;

    if (emojiMetaMap[code]) {
      emojiMetaMap[code].id_ = id;
      emojiMetaMap[code].__exist__ = row;
    } else {
      missingEmojis.push(id);
    }
  });
  saveToDB(db, 'meta_emoji', emojiMetaMap, true);
  removeFromDB(db, 'meta_emoji', missingEmojis);

  // 获取新增表情 id
  queryAll(db, 'select * from meta_emoji').forEach((row) => {
    const code = row.value_;

    emojiMetaMap[code].id_ = row.id_;
  });
}
