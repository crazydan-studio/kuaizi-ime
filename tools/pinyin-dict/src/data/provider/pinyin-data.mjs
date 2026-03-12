import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';

const data_path = () => fromRootPath('../..', 'thirdparty/pinyin-data');

/**
 * 从 https://github.com/mozillazg/pinyin-data 中读取汉典网的数据
 *
 * @return ```json
 * {'㑟': {
 *    value: '㑟', unicode: 'U+345F',
 *    pinyins: [{value: 'běng'}, {value: 'bó'}, {value: 'pěng'}]
 * }, ...}
 * ```
 */
export async function readZdicWords() {
  // https://github.com/mozillazg/pinyin-data/blob/master/zdic.txt
  const file = fromRootPath(data_path(), 'zdic.txt');

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
    const pinyins = joinedPinyin.split(/,/g).map((value) => ({ value }));

    data[word] = { value: word, unicode, pinyins };
  });

  return data;
}
