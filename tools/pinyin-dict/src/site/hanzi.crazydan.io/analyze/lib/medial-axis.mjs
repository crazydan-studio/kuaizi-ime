// Note: flo-mat@3.0.1 的中轴提取结果更精细
// https://github.com/FlorisSteenkamp/MAT
import {
  findMats,
  getPathsFromStr,
  traverseEdges,
  toScaleAxis,
  getCurveToNext,
  isTerminating
} from 'flo-mat';

/**
 * 提取中轴线分支
 *
 * @returns `[[radius, x1, y1, x2, y2], ...]`
 */
export function extractMedialAxisBranches(svgPath, satScale = 2) {
  const bezierLoops = getPathsFromStr(svgPath);

  const mats = findMats(
    bezierLoops,
    3 /*暂时未发现不同大小的值对最终效果的影响*/,
    10 /*中轴线段的最大长度，该值越大，获得的线段越少*/
  );

  // 用SAT去除毛刺分支
  let sats = null;
  try {
    sats = mats.map((mat) =>
      toScaleAxis(
        mat,
        satScale /*值越大，被判定为“太小”的分支就越多，修剪得就越干净*/
      )
    );
  } catch (e) {
    // Note: toScaleAxis 内部存在死循环并导致数组长度超出最大限制的可能
    console.log(e.message);
    return [];
  }

  const branches = [];
  sats.forEach((sat) => {
    const rootNode = sat.cpNode;

    let rootStart = null;
    let branch = [];

    traverseEdges(rootNode, (node) => {
      if (isTerminating(node)) return;

      const bezier = getCurveToNext(node);
      if (!bezier) return;

      const radius = parseFloat(node.cp.circle.radius.toFixed(2));

      const points = [];
      const get = createBezierPointGetter(bezier);
      // Note: 采样点过多反而造成单帧动画绘制时间变长，进而使得帧率下降，效果更差
      for (let t = 0; t <= 1; t += 1) {
        const point = get(t);
        // [x, y]
        points.push(point.map((p) => parseFloat(p.toFixed(2))));
      }

      const start = points[0];
      // 确定初始起点
      if (!rootStart) {
        rootStart = start;
      }

      // 确定新分支（从初始起点出发）
      if (rootStart[0] == start[0] && rootStart[1] == start[1]) {
        branch = [];
        branches.push(branch);
      }

      // 添加线段
      branch.push([radius, ...points.reduce((r, p) => r.concat(p), [])]);
    });
  });

  return branches.filter((b) => b.length > 10);
}

/** 返回贝塞尔曲线点取样函数 */
function createBezierPointGetter(bezier) {
  if (bezier.length === 2) {
    // 直线
    return (t) => [
      bezier[0][0] + (bezier[1][0] - bezier[0][0]) * t,
      bezier[0][1] + (bezier[1][1] - bezier[0][1]) * t
    ];
  } else if (bezier.length === 3) {
    // 二次贝塞尔
    return (t) => {
      const mt = 1 - t;
      return [
        mt * mt * bezier[0][0] +
          2 * mt * t * bezier[1][0] +
          t * t * bezier[2][0],
        mt * mt * bezier[0][1] +
          2 * mt * t * bezier[1][1] +
          t * t * bezier[2][1]
      ];
    };
  } else {
    // 三次贝塞尔
    return (t) => {
      const mt = 1 - t;
      return [
        mt * mt * mt * bezier[0][0] +
          3 * mt * mt * t * bezier[1][0] +
          3 * mt * t * t * bezier[2][0] +
          t * t * t * bezier[3][0],
        mt * mt * mt * bezier[0][1] +
          3 * mt * mt * t * bezier[1][1] +
          3 * mt * t * t * bezier[2][1] +
          t * t * t * bezier[3][1]
      ];
    };
  }
}
