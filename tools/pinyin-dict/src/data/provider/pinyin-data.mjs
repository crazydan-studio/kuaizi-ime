import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';

/**
 * 从 https://github.com/mozillazg/pinyin-data 中读取汉典网的数据
 *
 * @return ```json
 * {'㑟': {
 *    value: '㑟', unicode: 'U+345F',
 *    pinyins: {
 *      'běng': {value: 'běng'},
 *      'bó': {value: 'bó'},
 *      'pěng': {value: 'pěng'}
 *    }
 * }, ...}
 * ```
 */
export async function readZdicWords() {
  // https://github.com/mozillazg/pinyin-data/blob/master/zdic.txt
  const file = fromRootPath('../..', 'thirdparty/pinyin-data/zdic.txt');

  const data = {};
  await readLineFromFile(file, (line) => {
    line = line.trim();
    if (line.startsWith('#') || line === '') {
      return;
    }

    const unicode = line.replaceAll(/^([^:]+):.+/g, '$1');
    const joinedPinyin = line
      .replaceAll(/^.+:\s*([^\s]+)\s*#.*/g, '$1')
      .replaceAll(/["']/g, '');
    if (joinedPinyin === '') {
      return;
    }

    const word = line.replaceAll(/^.+#\s*([^\s]+).*$/g, '$1');
    const pinyins = {};
    joinedPinyin.split(/,/g).forEach((value) => {
      pinyins[value] = { value };
    });

    data[word] = { value: word, unicode, pinyins };
  });

  return data;
}
