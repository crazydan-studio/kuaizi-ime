import { getWordCode } from '#utils/word.mjs';

// 从 strokeorder.com 获取字的笔画演示（使用条款 https://www.strokeorder.com/terms.html）

export function getStrokeOrderUrl(word) {
  const code = getWordCode(word);

  return `https://www.strokeorder.com/assets/bishun/stroke/${code}.png`;
}
