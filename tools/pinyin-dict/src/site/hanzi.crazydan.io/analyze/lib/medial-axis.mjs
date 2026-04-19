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
 * @returns `[{radius: '2.3', bezier: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]}, ...]`
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

      const radius = node.cp.circle.radius.toFixed(2);

      const start = bezier[0];
      // 确定初始起点
      if (!rootStart) {
        rootStart = start;
      }

      // 确定新分支（从初始起点出发）
      if (rootStart[0] == start[0] && rootStart[1] == start[1]) {
        branch = [];
        branches.push(branch);
      }

      if (bezier.length > 1) {
        // 添加线段
        branch.push({
          radius,
          bezier: bezier.map((point) => point.map((p) => p.toFixed(2)))
        });
      }
    });
  });

  return branches; //.filter((b) => b.length > 10);
}
