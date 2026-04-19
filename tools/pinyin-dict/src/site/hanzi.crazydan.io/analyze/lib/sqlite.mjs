import * as path from 'path';

import { fromRootPath, readFile } from '#utils/file.mjs';
import {
  saveToDB,
  removeFromDB,
  execSQLFile,
  queryAll,
  execSQL
} from '#utils/sqlite.mjs';
import { extractMedialAxisBranches } from './medial-axis.mjs';

export { openDB as open, closeDB as close } from '#utils/sqlite.mjs';

/** 路径坐标点放大倍数（其值与 svg 坐标点精度相对应） */
const PATH_POINT_SCALE_FACTOR = 100;

const batch_size = 10000;
const sql_file_path = (name) =>
  fromRootPath(
    'src',
    'site/hanzi.crazydan.io/analyze/lib/' + name + '.create.sql'
  );

/** 保存笔画 SVG 路径 */
export function saveStrokeSvgPaths(db, strokeSvgFiles) {
  const sqlFile = sql_file_path('table-stroke');
  execSQLFile(db, sqlFile);

  // 清空已有数据，直接全量新增
  execSQL(db, 'delete from meta_zi_stroke');
  execSQL(db, 'delete from meta_zi_stroke_path');
  execSQL(db, 'delete from meta_zi_stroke_path_point');
  console.log(`- 已清除现有的路径数据`);

  let strokePaths = [];
  let ziStrokes = [];
  let strokePathPoints = [];
  const batchSave = () => {
    saveToDB(db, 'meta_zi_stroke_path', strokePaths, true);
    strokePaths = [];

    // ----
    saveToDB(db, 'meta_zi_stroke', ziStrokes, true);
    ziStrokes = [];

    saveToDB(db, 'meta_zi_stroke_path_point', strokePathPoints, true);
    strokePathPoints = [];

    // ----
    console.log(`- 已保存 ${pathId} 条路径数据`);
  };

  // -----------------------------------------------------------
  let pathId = 0;
  strokeSvgFiles.forEach((file) => {
    const unicode = path.basename(path.dirname(file));
    const zi_ = parseInt(unicode.replace(/^U\+/gi, ''), 16);

    const paths = [];
    const svg = readFile(file);

    let match;
    const regex = /<path\s+d="([^"]+)"\s+id="s-(\d+)-f-0"\/>/g;
    while ((match = regex.exec(svg)) !== null) {
      const path = match[1];
      const index = parseInt(match[2]);

      paths[index] = path;
    }

    paths
      .filter((p) => !!p)
      .forEach((path) => {
        // Note: 由于表中未直接记录路径字符串，无法通过路径与其建立关联，
        // 故而需要显式为路径设置 id，以确保字的笔画和路径坐标点能正确与其关联
        pathId += 1;
        strokePaths.push({ id_: pathId });

        // Note: 实际通过 id 大小来确定字笔画的顺序，因此，必须保证关联数据的插入顺序符合笔画顺序
        ziStrokes.push({ zi_, path_: pathId });

        const points = getSvgPathPoints(path, pathId);
        strokePathPoints = strokePathPoints.concat(points);

        if (pathId % batch_size == 0) {
          batchSave();
        }
      });
  });

  batchSave();
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

/** 仅用于将数据库中的笔画 svg 路径字符串转为坐标点，从而验证最终的存储空间是否有大幅节省 */
export function transferStrokePathData(db) {
  execSQL(db, 'delete from meta_zi_stroke_path_point');

  let strokePathPoints = [];
  const batchSave = () => {
    saveToDB(db, 'meta_zi_stroke_path_point', strokePathPoints, true);

    strokePathPoints = [];
  };

  let handled_amount = 0;
  queryAll(db, 'select id_, value_ from meta_zi_stroke_path').forEach((row) => {
    const { id_, value_ } = row;

    const points = getSvgPathPoints(value_, id_);
    strokePathPoints = strokePathPoints.concat(points);

    // -----------------------------------------------
    if (++handled_amount % batch_size == 0) {
      batchSave();
    }
  });

  batchSave();

  // 删除 svg 路径字符串
  execSQL(db, 'alter table meta_zi_stroke_path drop column value_');
}

function getSvgPathPoints(path, pathId) {
  const points = [];

  const segments = path.split(/\s+/);
  // Note: 坐标点扩大 N 倍以便于存储整数数据
  const parseAndScalePoint = (p) =>
    Math.round(parseFloat(p) * PATH_POINT_SCALE_FACTOR);

  for (let i = 0; i < segments.length; i++) {
    const type = segments[i];
    if (type == 'Z') {
      break;
    }

    const point = { path_: pathId };

    if (type == 'M') {
      point.type_ = 1;

      point.x0_ = parseAndScalePoint(segments[++i]);
      point.y0_ = parseAndScalePoint(segments[++i]);
      point.x1_ = 0;
      point.y1_ = 0;
      point.x2_ = 0;
      point.y2_ = 0;
    } else if (type == 'C') {
      point.type_ = 2;

      point.x0_ = parseAndScalePoint(segments[++i]);
      point.y0_ = parseAndScalePoint(segments[++i]);
      point.x1_ = parseAndScalePoint(segments[++i]);
      point.y1_ = parseAndScalePoint(segments[++i]);
      point.x2_ = parseAndScalePoint(segments[++i]);
      point.y2_ = parseAndScalePoint(segments[++i]);
    } else {
      console.log(`- Unknown path point type ${type}: ${path}`);
      continue;
    }

    points.push(point);
  }

  return points;
}
