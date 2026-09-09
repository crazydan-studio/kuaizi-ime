import * as fontkit from 'fontkit';
import getSystemFonts from 'get-system-fonts';

const systemFonts = await prepareSystemFonts();

export function sumCharCodes(zi) {
  let code = 0;
  for (var i = 0; i < zi.length; i++) {
    code += zi.charCodeAt(i);
  }
  return code;
}

export function getUnicodeStr(zi) {
  return 'U+' + getUnicode(zi).toString(16).toUpperCase();
}

export function getUnicode(zi) {
  return zi.codePointAt(0);
}

export function fromUnicode(code) {
  return String.fromCodePoint(code);
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
export function calculateZiStrokeSimilarity(s, t) {
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

// ---------------------------------------------------------------------
const ZI_GLYPH_STRUCTS = [
  { code: 0, name: '未知', examples: [] },
  //
  { code: 1, name: '独体结构', examples: ['人', '日', '水'] },
  { code: 2, name: '左右结构', examples: ['好', '明', '林'] },
  { code: 3, name: '左中右结构', examples: ['树', '做', '辩'] },
  { code: 4, name: '上下结构', examples: ['思', '花', '星'] },
  { code: 5, name: '上中下结构', examples: ['意', '草', '竟'] },
  { code: 6, name: '全包围结构', examples: ['国', '园', '回'] },
  { code: 7, name: '半包围结构', examples: ['区', '这', '同'] },
  //
  { code: 8, name: '品字结构', examples: ['品', '晶', '森'] },
  { code: 9, name: '镶嵌结构', examples: ['坐', '乘', '爽'] },
  // 半包围按包围方向细分（7 保持通用）
  { code: 10, name: '左上包围结构', examples: ['压', '病', '居', '历'] },
  { code: 11, name: '右上包围结构', examples: ['句', '可', '司', '氧'] },
  { code: 12, name: '左下包围结构', examples: ['这', '边', '建', '廷'] },
  { code: 13, name: '上包围结构', examples: ['同', '风', '周', '问'] },
  { code: 14, name: '下包围结构', examples: ['凶', '函', '画', '击'] },
  { code: 15, name: '左包围结构', examples: ['区', '医', '巨', '匹'] },
  { code: 16, name: '右包围结构', examples: [] }
];

export function getCodeByGlyphStruct(structName) {
  const structure = ZI_GLYPH_STRUCTS.filter((s) => s.name == structName)[0] || {};

  return structure.code || 0;
}

// ---------------------------------------------------------------------
