import { fromRootPath, readLineFromFile } from '#utils/file.mjs';

const data_path = (...paths) =>
  fromRootPath('../..', 'thirdparty/pinyin-data', ...paths);

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
export async function readZdicZies() {
  // https://github.com/mozillazg/pinyin-data/blob/master/zdic.txt
  const file = data_path('zdic.txt');

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

    const zi = line.replaceAll(/^.+#\s*([^\s]+).*$/g, '$1');
    const pinyins = joinedPinyin.split(/,/g).map((value) => ({ value }));

    data[zi] = { value: zi, unicode, pinyins };
  });

  return data;
}
