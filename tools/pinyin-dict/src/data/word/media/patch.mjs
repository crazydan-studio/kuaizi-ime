import { readJSONFromFile, writeJSONToFile, existFile } from '#utils/utils.mjs';

import { getStrokeOrderUrl } from '#data/provider/strokeorder.com.mjs';

/**
 * 向字补充媒体信息并保存到文件
 *
 * @return ```json
 * {
 *    pinyins: {yi: 'https://xxx', ...},
 *    words: [{
 *      value: '字',
 *      unicode: 'U+5B57',
 *      media: {
 *        glyph_url: 'https://xxx',
 *        stroke_order_url: 'https://xxx'
 *      }
 *    }, ...]
 * }
 * ```
 */
export async function patchWordMedias(wordMetas) {
  const wordMedias = { pinyins: {}, words: [] };

  wordMetas.forEach((meta) => {
    meta.pinyins.forEach(({ value }) => {
      if (!wordMedias.pinyins[value]) {
        wordMedias.pinyins[value] =
          `https://img.zdic.net/audio/zd/py/${value}.mp3`;
      }
    });

    wordMedias.words.push({
      value: meta.value,
      unicode: meta.unicode,
      media: {
        glyph_url: meta.glyph_svg_url,
        stroke_order_url: getStrokeOrderUrl(meta.value)
      }
    });
  });

  return wordMedias;
}
