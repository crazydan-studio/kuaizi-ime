import * as path from 'path';

import { fromRootPath, readFile } from '#utils/file.mjs';
import { saveToDB, execSQLFile, queryAll, execSQL } from '#utils/sqlite.mjs';
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

export function saveStrokeMedialAxes(db, range) {
  const sqlFile = sql_file_path('table-stroke-medial-axis');
  execSQLFile(db, sqlFile);

  const needToClean = !range || range[0] == 0;
  if (needToClean) {
    execSQL(db, 'delete from meta_zi_stroke_path_medial_axis_branch_segment');
    execSQL(db, 'delete from meta_zi_stroke_path_medial_axis_branch');
    console.log(`- 已清除现有的中轴线数据`);
  }

  let medialAxisBranches = [];
  let medialAxisBranchSegments = [];
  const batchSave = () => {
    saveToDB(
      db,
      'meta_zi_stroke_path_medial_axis_branch',
      medialAxisBranches,
      true
    );
    medialAxisBranches = [];

    // ----
    saveToDB(
      db,
      'meta_zi_stroke_path_medial_axis_branch_segment',
      medialAxisBranchSegments,
      true
    );
    medialAxisBranchSegments = [];

    // ----
    console.log(`- 已保存 ${branchId} 条中轴线数据`);
  };

  // ---------------------------------------------
  let branchId = 0;
  const limitClause = range ? ` limit ${range.join(',')}` : '';

  if (!needToClean) {
    queryAll(
      db,
      `select max(id_) as id_ from meta_zi_stroke_path_medial_axis_branch`
    ).forEach((row) => {
      branchId = row.id_;
    });
  }

  queryAll(db, `select id_, value_ from zi_stroke_path ${limitClause}`).forEach(
    (row) => {
      const { id_, value_ } = row;
      const pathId = id_;
      const pathSvg = value_;
      const branches = extractMedialAxisBranches(pathSvg);

      if (branches.length == 0) {
        console.log(`- 未提取到有效中轴线：${pathSvg}`);
        return;
      }

      branches.forEach((branch) => {
        // 按顺序递增中轴线分支 id，以确保与中轴线分支线段直接建立关联，避免反复查询数据库
        branchId += 1;
        medialAxisBranches.push({ id_: branchId, path_: pathId });

        //
        branch.forEach(({ radius, bezier }) => {
          // Note: 得到的中轴线线段足够短可近似为直线，故而只保存线段的起止点，以降低存储占用
          const start = bezier[0];
          const end = bezier[bezier.length - 1];

          const segment = {
            branch_: branchId,
            radius_: parseAndScalePoint(radius),
            x0_: parseAndScalePoint(start[0]),
            y0_: parseAndScalePoint(start[1]),
            x1_: parseAndScalePoint(end[0]),
            y1_: parseAndScalePoint(end[1])
          };

          medialAxisBranchSegments.push(segment);
        });

        if (branchId % batch_size == 0) {
          batchSave();
        }
      });
    }
  );

  batchSave();
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

// Note: 坐标点扩大 N 倍以便于存储整数数据
const parseAndScalePoint = (p) =>
  p == '0' || p == '0.00'
    ? 0
    : Math.round(parseFloat(p) * PATH_POINT_SCALE_FACTOR);

function getSvgPathPoints(path, pathId) {
  const points = [];

  const segments = path.split(/\s+/);

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
