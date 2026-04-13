import * as path from 'path';

import { fromRootPath, readFile } from '#utils/file.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll
} from '#utils/sqlite.mjs';
import { extractMedialAxisBranches } from './medial-axis.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

const sql_file_path = (name) =>
  fromRootPath(
    'src',
    'site/hanzi.crazydan.io/analyze/lib/' + name + '.create.sql'
  );

/** 保存笔画 SVG 路径 */
export function saveStrokeSvgPaths(db, strokeSvgFiles) {
  const sqlFile = sql_file_path('table-stroke');
  execSQLFile(db, sqlFile);

  const ziStrokes = {};
  const strokePaths = {};
  strokeSvgFiles.forEach((file) => {
    const unicode = path.basename(path.dirname(file));
    const zi_ = parseInt(unicode.replace(/^U\+/gi, ''), 16);

    const regex = /<path\s+d="([^"]+)"\s+id="s-(\d+)-f-0"\/>/g;

    let match;
    const svg = readFile(file);
    while ((match = regex.exec(svg)) !== null) {
      const path_ = match[1]
        .replaceAll(/\.00/g, '')
        .replaceAll(/(\.[^0])0/g, '$1'); // 去掉路径中不必要的 0, 从而节省存储空间
      const index_ = parseInt(match[2]);

      const code = `${zi_}:${index_}`;

      ziStrokes[code] = { zi_, index_, path_ };
      strokePaths[path_] = { value_: path_ };
    }
  });

  // -----------------------------------------------------------
  const missingPaths = [];
  queryAll(db, 'select id_, value_ from meta_zi_stroke_path').forEach((row) => {
    const { id_, value_ } = row;
    const code = value_;

    if (strokePaths[code]) {
      strokePaths[code].id_ = id_;
      strokePaths[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingPaths.push(id_);
      console.log('- 笔画路径已被废弃或被替换：', id_);
    }
  });
  saveToDB(db, 'meta_zi_stroke_path', strokePaths, true);
  removeFromDB(db, 'meta_zi_stroke_path', missingPaths);

  //
  queryAll(db, 'select id_, value_ from meta_zi_stroke_path').forEach((row) => {
    const { id_, value_ } = row;
    const code = value_;

    strokePaths[code].id_ = id_;
  });

  // -----------------------------------------------------------
  Object.keys(ziStrokes).forEach((code) => {
    const path = ziStrokes[code].path_;

    ziStrokes[code].path_ = strokePaths[path].id_;
  });

  const missingStrokes = [];
  queryAll(db, 'select id_, zi_, index_, path_ from meta_zi_stroke').forEach(
    (row) => {
      const { id_, zi_, index_ } = row;
      const code = `${zi_}:${index_}`;

      if (ziStrokes[code]) {
        ziStrokes[code].id_ = id_;
        ziStrokes[code].__exist__ = row;
      } else {
        // 在库中已存在，但已不再被使用
        missingStrokes.push(id_);
        console.log('- 字的笔画路径已被废弃或被替换：', id_, zi_, index_);
      }
    }
  );
  saveToDB(db, 'meta_zi_stroke', ziStrokes, true);
  removeFromDB(db, 'meta_zi_stroke', missingStrokes);
}

export function saveStrokeMedialAxes(db, sampleCount) {
  const sqlFile = sql_file_path('table-stroke-medial-axis');
  execSQLFile(db, sqlFile);

  // ---------------------------------------------
  const limitClause = sampleCount > 0 ? ` limit ${sampleCount}` : '';

  const strokePaths = {};
  queryAll(
    db,
    `select id_, value_ from meta_zi_stroke_path ${limitClause}`
  ).forEach((row) => {
    const { id_, value_ } = row;

    strokePaths[id_] = value_;
  });

  // ---------------------------------------------
  const medialAxisBranches = {};
  Object.keys(strokePaths).forEach((path_) => {
    if (['3386'].includes(path_)) {
      console.log(`- 忽略路径 ${path_}`);
      return;
    }

    const svgPath = strokePaths[path_];
    const branches = extractMedialAxisBranches(svgPath);

    if (branches.length == 0) {
      console.log(`- 未提取到路径中轴线（id=${path_}）：`, svgPath);
      return;
    }

    branches.forEach((branch, index_) => {
      const code = `${path_}:${index_}`;

      medialAxisBranches[code] = {
        path_,
        index_,
        value_: JSON.stringify(branch)
      };
    });
  });

  const missingMedialAxisBranches = [];
  queryAll(
    db,
    'select id_, path_, index_, value_ from meta_zi_stroke_path_medial_axis_branch'
  ).forEach((row) => {
    const { id_, path_, index_ } = row;
    const code = `${path_}:${index_}`;

    if (medialAxisBranches[code]) {
      medialAxisBranches[code].id_ = id_;
      medialAxisBranches[code].__exist__ = row;
    } else {
      // 在库中已存在，但已不再被使用
      missingMedialAxisBranches.push(id_);
      console.log('- 笔画路径中轴线分支已被废弃或被替换：', id_, path_, index_);
    }
  });
  saveToDB(
    db,
    'meta_zi_stroke_path_medial_axis_branch',
    medialAxisBranches,
    true
  );
  removeFromDB(
    db,
    'meta_zi_stroke_path_medial_axis_branch',
    missingMedialAxisBranches
  );
}
