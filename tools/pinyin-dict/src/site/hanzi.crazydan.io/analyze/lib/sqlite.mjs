import * as path from 'path';

import { fromRootPath, readFile } from '#utils/file.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath('src', 'site/hanzi.crazydan.io/analyze/lib/' + name + '.create.sql');

/** 保存笔画 SVG 路径 */
export function saveStrokeSvgPaths(db, strokeSvgFiles) {
  const sqlFile = sql_file_path('table-stroke');
  execSQLFile(db, sqlFile);

  const ziStrokePaths = {};
  strokeSvgFiles.forEach((file) => {
    const unicode = path.basename(path.dirname(file));

    const regex = /<path\s+d="([^"]+)"\s+id="s-(\d+)-f-0"\/>/g;

    let match;
    const svg = readFile(file);
    while ((match = regex.exec(svg)) !== null) {
      const path_ = match[1];
      const index_ = parseInt(match[2]);

      const code = `${unicode}:${index_}`;
      ziStrokePaths[code] = { zi_: unicode, index_, path_ };
    }
  });

  const missingPaths = [];
  queryAll(db, 'select id_, zi_, index_ from meta_zi_stroke').forEach((row) => {
    const { id_, zi_, index_ } = row;
    const code = `${zi_}:${index_}`;

    if (ziStrokePaths[code]) {
      ziStrokePaths[code].id_ = id_;
      ziStrokePaths[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingPaths.push(id_);
      console.log('- 笔画路径已被废弃或被替换：', id_, zi_, index_);
    }
  });
  saveToDB(db, 'meta_zi_stroke', ziStrokePaths);
  removeFromDB(db, 'meta_zi_stroke', missingPaths);
}
