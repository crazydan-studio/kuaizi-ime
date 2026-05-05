import { fromRootPath } from '#utils/file.mjs';
import { zeroPinyinTone, getPinyinTone } from '#utils/spell.mjs';
import { saveToDB, execSQL, execSQLFile } from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'site/hanzi.crazydan.io/lib/' + name + '.create.sql');

/** 保存字信息 */
export function saveZies(db, ziMetas) {
  const sqlFile = sql_file_path('table-zi');
  execSQLFile(db, sqlFile);

  // 清空已有数据，直接全量新增
  execSQL(db, 'delete from meta_pinyin');
  execSQL(db, 'delete from meta_zi');
  console.log(`- 已清除现有数据`);

  // ----------------------------------------------------------------
  const pinyinMetaData = {};
  const ziMetaData = {};

  let pinyinId = 0;
  ziMetas.forEach((ziMeta) => {
    const unicode = ziMeta.value.codePointAt(0);

    ziMeta.pinyins.forEach((py) => {
      const pyValue = zeroPinyinTone(py.value);
      const pyTone = getPinyinTone(py.value);
      const pyCode = `${pyValue}:${pyTone}`;
      let pyMeta = pinyinMetaData[pyCode];

      if (!pyMeta) {
        pinyinId += 1;
        pyMeta = pinyinMetaData[pyCode] = {
          id_: pinyinId,
          value_: pyValue,
          tone_: pyTone
        };
      }

      const ziCode = `${unicode}:${pyCode}`;
      ziMetaData[ziCode] = {
        unicode_: unicode,
        pinyin_: pyMeta.id_,
        weight_: py.used_weight || 0
      };
    });
  });

  saveToDB(db, 'meta_pinyin', pinyinMetaData, true);
  saveToDB(db, 'meta_zi', ziMetaData, true);
}
