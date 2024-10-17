/* 对比不同版本的 SQLite 字典库的数据差异 */
import { fromRootPath } from '#utils/utils.mjs';

import { openDB, closeDB, asyncForEach } from '#utils/sqlite.mjs';

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
    }
  );
}

async function diffWordData(oldDb, newDb) {
  await asyncForEach(
    ['link_word_with_pinyin' /*, 'link_word_with_zhuyin'*/],
    async (table) => {
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

      Object.keys(newData).forEach((id) => {
        const oldRow = oldData[id];
        const newRow = newData[id];

        if (!oldRow) {
          console.log(`- ${table} => 字数据 ${id} 为新增`);
          return;
        }

        const oldCode = `${oldRow.source_id_}:${oldRow.target_id_}:${oldRow.target_chars_id_}`;
        const newCode = `${newRow.source_id_}:${newRow.target_id_}:${newRow.target_chars_id_}`;

        if (oldCode != newCode) {
          console.log(
            `- ${table} => 字数据 ${id} 的组合不同: ${oldCode} -> ${newCode}`
          );
        }
      });
    }
  );
}
