import { getWordCode } from '#utils/word.mjs';

// 从 strokeorder.com 获取字的笔画演示（使用条款 https://www.strokeorder.com/terms.html）

/**
 * 获取单个字的笔画演示图
 *
 * @return `{stroke_demo_url: 'https://xxx', stroke_order_url: 'https://xxx'}`
 */
export function getStrokeImage(word) {
  const code = getWordCode(word);

  return {
    stroke_demo_url: `https://www.strokeorder.com/assets/bishun/animation/${code}.gif`,
    stroke_order_url: `https://www.strokeorder.com/assets/bishun/stroke/${code}.png`
  };
}
