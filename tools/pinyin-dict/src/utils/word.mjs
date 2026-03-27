import * as fontkit from 'fontkit';
import getSystemFonts from 'get-system-fonts';

const systemFonts = await prepareSystemFonts();

export function getWordCode(word) {
  let code = 0;
  for (var i = 0; i < word.length; i++) {
    code += word.charCodeAt(i);
  }
  return code;
}

export function getWordUnicode(word) {
  return 'U+' + word.codePointAt(0).toString(16).toUpperCase();
}

/** 判断系统字体中是否存在指定编码的字形，若不存在，则表示该编码的字不可读 */
export function hasGlyphFontForCodePoint(unicode) {
  const codePoint = parseInt('0x' + unicode.replaceAll(/^U\+/g, ''), 16);

  for (let i = 0; i < systemFonts.length; i++) {
    const font = systemFonts[i];

    if (font.hasGlyphForCodePoint(codePoint)) {
      return true;
    }
  }
  return false;
}

/**
 * 计算两个笔画的相似度（Levenshtein Distance）：
 * - [Sort an array by the "Levenshtein Distance" with best performance in Javascript](https://stackoverflow.com/a/11958496)
 * - [字符串编辑距离之 Damerau–Levenshtein Distance](https://blog.csdn.net/asty9000/article/details/81570627)
 * - [字符串编辑距离之 Levenshtein Distance](https://blog.csdn.net/asty9000/article/details/81384650)
 * - [Damerau–Levenshtein distance](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance)
 */
export function calculateWordStrokeSimilarity(s, t) {
  const d = []; // 2d matrix

  // Step 1
  const n = s.length;
  const m = t.length;

  if (n == 0) return 0;
  if (m == 0) return 0;

  // Create an array of arrays in javascript (a descending loop is quicker)
  for (let i = n; i >= 0; i--) d[i] = [];

  // Step 2
  for (let i = n; i >= 0; i--) d[i][0] = i;
  for (let j = m; j >= 0; j--) d[0][j] = j;

  // Step 3
  for (let i = 1; i <= n; i++) {
    const s_i = s.charAt(i - 1);

    // Step 4
    for (let j = 1; j <= m; j++) {
      // Check the jagged ld total so far
      if (i == j && d[i][j] > 4) return n;

      const t_j = t.charAt(j - 1);
      const cost = s_i == t_j ? 0 : 1; // Step 5

      // Calculate the minimum
      let mi = d[i - 1][j] + 1;
      const b = d[i][j - 1] + 1;
      const c = d[i - 1][j - 1] + cost;

      if (b < mi) mi = b;
      if (c < mi) mi = c;

      d[i][j] = mi; // Step 6

      // Note: 不做转换变换
      // // Damerau transposition
      // if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
      //   d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      // }
    }
  }

  // Step 7
  return 1 - d[n][m] / Math.max(n, m);
}

async function prepareSystemFonts() {
  // https://www.npmjs.com/package/get-system-fonts
  const fontFiles = await getSystemFonts();
  const fonts = [];

  // https://github.com/foliojs/fontkit#fonthasglyphforcodepointcodepoint
  fontFiles.forEach((file) => {
    try {
      const font = fontkit.openSync(file);
      if (!font.hasGlyphForCodePoint) {
        return;
      }

      //console.info('Read font file: ' + file);
      fonts.push(font);
    } catch (e) {
      //console.warn('Failed to read font file: ' + file, e);
    }
  });

  return fonts;
}
