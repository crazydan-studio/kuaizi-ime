import { hasGlyphFontForCodePoint } from '../utils/utils.mjs';
import { fetchWordMetas } from '../utils/zdic.mjs';

const unicodes = [
  'U+20C43' /* 𠱃 */,
  'U+20C53' /* 𠱓 */,
  'U+20C65' /* 𠱥 */,
  'U+20C8D' /* 𠲍 */,
  'U+20C96' /* 𠲖 */,
  'U+20C9C' /* 𠲜 */,
  'U+20CB5' /* 𠲵 */,
  'U+20CD0' /* 𠳐 */,
  'U+20CED' /* 𠳭 */
];
for (let i = 0; i < unicodes.length; i++) {
  const unicode = unicodes[i];
  const codePoint = parseInt(unicode.replaceAll(/^U\+/g, '0x'), 16);
  const char = String.fromCharCode(codePoint);
  const exist = hasGlyphFontForCodePoint(unicode);

  console.log(unicode + ' - ' + char + ': ' + exist);
}

// const words = ['㑵', '𥁞', '尽', '国', '𣴘'];
// const wordMetas = await fetchWordMetas(words);
// console.log(JSON.stringify(wordMetas));
