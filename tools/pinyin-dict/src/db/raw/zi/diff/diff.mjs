import { queryAll } from '#utils/sqlite.mjs';

export function diffMetaData(oldDb, newDb) {
  [
    {
      new_table: { name: 'meta_pinyin', prop: 'raw_' },
      old_table: { name: 'meta_pinyin', prop: 'value_' }
    },
    {
      new_table: { name: 'meta_zi', prop: 'value_' },
      old_table: { name: 'meta_word', prop: 'value_' }
    }
  ].forEach(({ new_table, old_table }) => {
    const oldData = {};
    const newData = {};

    queryAll(
      oldDb,
      `select id_, ${old_table.prop} from ${old_table.name}`
    ).forEach((row) => {
      const id = row.id_;
      const value = row[old_table.prop];

      oldData[value] = { id };
    });
    queryAll(
      newDb,
      `select id_, ${new_table.prop} from ${new_table.name}`
    ).forEach((row) => {
      const id = row.id_;
      const value = row[new_table.prop];

      newData[value] = { id };
    });

    Object.keys(newData).forEach((value) => {
      const newId = newData[value].id;
      const oldId = (oldData[value] || {}).id;

      if (!oldId) {
        console.log(`- ${new_table.name} => 元数据 ${value}:${newId} 为新增`);
      } //
      else if (oldId != newId) {
        console.log(
          `- ${new_table.name} => 元数据 ${value} 的 id 不同: ${oldId} -> ${newId}`
        );
      }
    });

    Object.keys(oldData).forEach((value) => {
      const newId = (newData[value] || {}).id;
      const oldId = oldData[value].id;

      if (!newId) {
        console.log(`- ${old_table.name} => 元数据 ${value}:${oldId} 已被删除`);
      }
    });
  });
}

export function diffZiData(oldDb, newDb) {
  [{ new_table: 'pinyin_zi', old_table: 'pinyin_word' }].forEach(
    ({ new_table, old_table }) => {
      const oldData = { __mapping__: {} };
      const newData = { __mapping__: {} };

      queryAll(oldDb, `select * from ${old_table} group by id_`).forEach(
        (row) => {
          const id = row.id_;
          const zi = row.zi_ || row.word_;
          const spell = row.spell_raw_ || row.spell_;

          oldData[id] = row;
          (oldData.__mapping__[zi] ||= []).push(spell);
        }
      );
      queryAll(newDb, `select * from ${new_table} group by id_`).forEach(
        (row) => {
          const id = row.id_;
          const zi = row.zi_ || row.word_;
          const spell = row.spell_raw_ || row.spell_;

          newData[id] = row;
          (newData.__mapping__[zi] ||= []).push(spell);
        }
      );

      Object.keys(newData).forEach((id) => {
        const oldRow = oldData[id];
        const newRow = newData[id];

        const zi = newRow.zi_ || newRow.word_;
        const spell = newRow.spell_raw_ || newRow.spell_;

        if (!oldRow) {
          const newSpells = (newData.__mapping__[zi] || []).filter(
            (s) => s != spell
          );

          console.log(
            `- ${new_table} => 字数据 ${id}:${zi}:${spell} 为新增。${zi} ` +
              (newSpells.length > 0
                ? `还有新读音 ${newSpells.join(',')}`
                : '再无其他新读音')
          );
        } //
        else {
          // Note: source_id_/target_id_/target_chars_id_ 是在兼容最初始的版本
          const genCode = (row) => {
            return `${row.zi_id_ || row.word_id_ || row.source_id_}:${
              row.spell_id_ || row.target_id_
            }`;
          };

          const oldCode = genCode(oldRow);
          const newCode = genCode(newRow);

          if (oldCode != newCode) {
            console.log(
              `- ${new_table} => 字数据 ${id}:${zi}:${spell} 的组合不同: ${oldCode} -> ${newCode}`
            );
          }
        }
      });

      Object.keys(oldData).forEach((id) => {
        const oldRow = oldData[id];
        const newRow = newData[id];

        const zi = oldRow.zi_ || oldRow.word_;
        const spell = oldRow.spell_raw_ || oldRow.spell_;

        if (!newRow) {
          const newSpells = newData.__mapping__[zi] || [];

          console.log(
            `- ${old_table} => 字数据 ${id}:${zi}:${spell} 已被删除。${zi} ` +
              (newSpells.length > 0
                ? `还剩余读音 ${newSpells.join(',')}`
                : '再无其他剩余读音')
          );
        }
      });
    }
  );
}
