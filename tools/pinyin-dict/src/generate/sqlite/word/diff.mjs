/* 对比不同版本的 SQLite 字典库的数据差异 */
import { fromRootPath, asyncForEach } from '#utils/utils.mjs';

import { openDB, closeDB } from '#utils/sqlite.mjs';

const oldDictDataSQLiteFile = fromRootPath(
  'data',
  'pinyin-word-dict.v2.sqlite'
);
const dictDataSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');

let oldDb = await openDB(oldDictDataSQLiteFile);
let newDb = await openDB(dictDataSQLiteFile);

try {
  console.log();
  console.log('对比元数据的差异 ...');
  await diffMetaData(oldDb, newDb);

  console.log();
  console.log('对比字数据的差异 ...');
  await diffWordData(oldDb, newDb);
} catch (e) {
  throw e;
} finally {
  await closeDB(oldDb);
  await closeDB(newDb);
}

async function diffMetaData(oldDb, newDb) {
  await asyncForEach(
    [
      'meta_pinyin',
      'meta_pinyin_chars',
      'meta_zhuyin',
      'meta_zhuyin_chars',
      'meta_word'
    ],
    async (table) => {
      const oldData = {};
      const newData = {};

      (await oldDb.all(`select * from ${table}`)).forEach((row) => {
        const value = row.value_;
        const id_ = row.id_;

        oldData[value] = { id_ };
      });
      (await newDb.all(`select * from ${table}`)).forEach((row) => {
        const value = row.value_;
        const id_ = row.id_;

        newData[value] = { id_ };
      });

      Object.keys(newData).forEach((value) => {
        if (!oldData[value]) {
          console.log(`- ${table} => 元数据 ${value} 为新增`);
          return;
        }

        const oldId = oldData[value].id_;
        const newId = newData[value].id_;

        if (oldId != newId) {
          console.log(
            `- ${table} => 元数据 ${value} 的 id 不同: ${oldId} -> ${newId}`
          );
        }
      });

      Object.keys(oldData).forEach((value) => {
        if (!newData[value]) {
          console.log(`- ${table} => 元数据 ${value} 已被删除`);
          return;
        }
      });
    }
  );
}

async function diffWordData(oldDb, newDb) {
  await asyncForEach(['pinyin_word' /*, 'zhuyin_word'*/], async (table) => {
    const oldData = {};
    const newData = {};

    (await oldDb.all(`select * from ${table}`)).forEach((row) => {
      const id = row.id_;

      oldData[id] = row;
    });
    (await newDb.all(`select * from ${table}`)).forEach((row) => {
      const id = row.id_;

      newData[id] = row;
    });

    const genCode = (row) => {
      return `${row.word_id_ || row.source_id_}:${
        row.spell_id_ || row.target_id_
      }:${row.spell_chars_id_ || row.target_chars_id_}`;
    };

    Object.keys(newData).forEach((id) => {
      const oldRow = oldData[id];
      const newRow = newData[id];

      if (!oldRow) {
        console.log(
          `- ${table} => 字数据 ${id}:${newRow.word_}:${newRow.spell_} 为新增`
        );
        return;
      }

      const oldCode = genCode(oldRow);
      const newCode = genCode(newRow);

      if (oldCode != newCode) {
        console.log(
          `- ${table} => 字数据 ${id}:${newRow.word_}:${newRow.spell_} 的组合不同: ${oldCode} -> ${newCode}`
        );
      }
    });

    Object.keys(oldData).forEach((id) => {
      const oldRow = oldData[id];
      if (!newData[id]) {
        console.log(
          `- ${table} => 字数据 ${id}:${oldRow.word_}:${oldRow.spell_} 已被删除`
        );
        return;
      }
    });
  });
}
