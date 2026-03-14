import { queryAll } from '#utils/sqlite.mjs';

export function diffMetaData(oldDb, newDb) {
  [
    'meta_pinyin',
    'meta_pinyin_chars',
    // 'meta_zhuyin',
    // 'meta_zhuyin_chars',
    'meta_word'
  ].forEach((table) => {
    const oldData = {};
    const newData = {};

    queryAll(oldDb, `select id_, value_ from ${table}`).forEach((row) => {
      const id = row.id_;
      const value = row.value_;

      oldData[value] = { id };
    });
    queryAll(newDb, `select id_, value_ from ${table}`).forEach((row) => {
      const id = row.id_;
      const value = row.value_;

      newData[value] = { id };
    });

    Object.keys(newData).forEach((value) => {
      const newId = newData[value].id;
      const oldId = (oldData[value] || {}).id;

      if (!oldId) {
        console.log(`- ${table} => 元数据 ${value}:${newId} 为新增`);
      } //
      else if (oldId != newId) {
        console.log(
          `- ${table} => 元数据 ${value} 的 id 不同: ${oldId} -> ${newId}`
        );
      }
    });

    Object.keys(oldData).forEach((value) => {
      const newId = (newData[value] || {}).id;
      const oldId = oldData[value].id;

      if (!newId) {
        console.log(`- ${table} => 元数据 ${value}:${oldId} 已被删除`);
      }
    });
  });
}

export function diffWordData(oldDb, newDb) {
  [
    'pinyin_word'
    // 'zhuyin_word'
  ].forEach((table) => {
    const oldData = { __mapping__: {} };
    const newData = { __mapping__: {} };

    queryAll(oldDb, `select * from ${table} group by id_`).forEach((row) => {
      const id = row.id_;

      oldData[id] = row;
      (oldData.__mapping__[row.word_] ||= []).push(row.spell_);
    });
    queryAll(newDb, `select * from ${table} group by id_`).forEach((row) => {
      const id = row.id_;

      newData[id] = row;
      (newData.__mapping__[row.word_] ||= []).push(row.spell_);
    });

    // Note: source_id_/target_id_/target_chars_id_ 是在兼容最初始的版本
    const genCode = (row) => {
      return `${row.word_id_ || row.source_id_}:${
        row.spell_id_ || row.target_id_
      }:${row.spell_chars_id_ || row.target_chars_id_}`;
    };

    Object.keys(newData).forEach((id) => {
      const oldRow = oldData[id];
      const newRow = newData[id];

      const word = newRow.word_;
      const spell = newRow.spell_;

      if (!oldRow) {
        const newSpells = (newData.__mapping__[word] || []).filter(
          (s) => s != spell
        );

        console.log(
          `- ${table} => 字数据 ${id}:${word}:${spell} 为新增。${word} ` +
            (newSpells.length > 0
              ? `还有新读音 ${newSpells.join(',')}`
              : '再无其他新读音')
        );
      } //
      else {
        const oldCode = genCode(oldRow);
        const newCode = genCode(newRow);

        if (oldCode != newCode) {
          console.log(
            `- ${table} => 字数据 ${id}:${word}:${spell} 的组合不同: ${oldCode} -> ${newCode}`
          );
        }
      }
    });

    Object.keys(oldData).forEach((id) => {
      const oldRow = oldData[id];
      const newRow = newData[id];

      const word = oldRow.word_;
      const spell = oldRow.spell_;

      if (!newRow) {
        const newSpells = newData.__mapping__[word] || [];

        console.log(
          `- ${table} => 字数据 ${id}:${word}:${spell} 已被删除。${word} ` +
            (newSpells.length > 0
              ? `还剩余读音 ${newSpells.join(',')}`
              : '再无其他剩余读音')
        );
      }
    });
  });
}
