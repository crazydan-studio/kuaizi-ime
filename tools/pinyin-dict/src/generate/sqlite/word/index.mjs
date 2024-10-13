/* SQLite 字典库 */
import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

// 收集数据
const wordDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');
const emojiDataFile = fromRootPath('data', 'emojis.json');
// 分析数据
const pinyinCharsFile = fromRootPath('..', 'analyze/files/pinyin.txt');
const pinyinCharLinksFile = fromRootPath('..', 'analyze/files/char-links.json');
const pinyinCharTreeFile = fromRootPath('..', 'analyze/files/char-tree.json');

// SQLite 字典库
const wordDictDataSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');

console.log();
console.log('读取已收集的有效字信息 ...');
const wordMetas = [];
await readLineFromFile(wordDataValidFile, (line) => {
  if (!line || !line.trim()) {
    return;
  }

  const metas = JSON.parse(line);
  metas.forEach((meta) => {
    wordMetas.push(meta);

    // 单独修正输入数据
    [
      // “一”和“不”变调有规律：https://www.chinanews.com.cn/hwjy/news/2010/04-15/2228742.shtml
      { value: '不', pinyin: 'bú', chars: 'bu' },
      { value: '一', pinyin: 'yì', chars: 'yi' },
      { value: '一', pinyin: 'yí', chars: 'yi' },
      { value: '子', pinyin: 'zi', chars: 'zi' },
      // 便宜：pián yi
      { value: '宜', pinyin: 'yi', chars: 'yi' },
      { value: '噷', pinyin: 'hm', chars: 'hm' },
      { value: '吒', pinyin: 'zhà', chars: 'zha' },
      { value: '虎', pinyin: 'hu', chars: 'hu' },
      { value: '枸', pinyin: 'gōu', chars: 'gou' },
      { value: '焘', pinyin: 'tāo', chars: 'tao' },
      { value: '喇', pinyin: 'lā', chars: 'la' },
      { value: '喇', pinyin: 'lá', chars: 'la' },
      { value: '蕃', pinyin: 'bō', chars: 'bo' },
      { value: '蕃', pinyin: 'fān', chars: 'fan' },
      { value: '脯', pinyin: 'pú', chars: 'pu' },
      { value: '蕻', pinyin: 'hóng', chars: 'hong' },
      { value: '朵', pinyin: 'duo', chars: 'duo' },
      { value: '鏜', pinyin: 'táng', chars: 'tang' },
      { value: '咔', pinyin: 'kā', chars: 'ka' },
      { value: '蹬', pinyin: 'dèng', chars: 'deng' }
    ].forEach(({ value, pinyin, chars }) => {
      if (
        meta.value == value &&
        meta.pinyins.filter(({ value }) => value == pinyin).length == 0
      ) {
        meta.pinyins.push({ value: pinyin, chars });
      }
    });
  });
});
console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

console.log();
console.log('写入字信息到 SQLite ...');
let db1 = await sqlite.open(wordDictDataSQLiteFile);

try {
  await sqlite.saveSpells(db1, wordMetas);
  console.log('- 已保存字读音信息');

  await sqlite.saveWords(db1, wordMetas);
  console.log('- 已保存字信息');

  await sqlite.savePhrases(db1, wordMetas);
  console.log('- 已保存词组信息');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db1);
}

console.log();

console.log();
console.log('读取已收集的表情符号 ...');
const groupEmojiMetas = {};
await readLineFromFile(emojiDataFile, (line) => {
  if (!line || !line.trim()) {
    return;
  }

  const groups = JSON.parse(line);
  groups.forEach((group) => {
    let groupName = group.name.zh;
    switch (groupName) {
      case '表情与情感':
        groupName = '表情';
        break;
      case '人物与身体':
        groupName = '人物';
        break;
      case '动物与自然':
        groupName = '动植物';
        break;
      case '食物与饮料':
        groupName = '饮食';
        break;
      case '旅行与地理':
        groupName = '旅行';
        break;
      case '符号标志':
        groupName = '符号';
        break;
    }

    groupEmojiMetas[groupName] = group.emojis;
  });
});
console.log(
  '- 表情符号总数：' +
    Object.values(groupEmojiMetas).reduce(
      (acc, emojis) => acc + emojis.length,
      0
    )
);
console.log();

console.log();
console.log('写入表情符号到 SQLite ...');
let db2 = await sqlite.open(wordDictDataSQLiteFile);
try {
  await sqlite.saveEmojis(db2, groupEmojiMetas);
  console.log('- 已保存表情符号数据');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db2);
}
console.log();

console.log();
console.log('通过 SQLite 生成分析数据 ...');
let db3 = await sqlite.open(wordDictDataSQLiteFile);
try {
  await sqlite.generatePinyinChars(db3, pinyinCharsFile);
  console.log('- 已保存拼音字母组合数据');

  await sqlite.generatePinyinCharLinks(db3, pinyinCharLinksFile);
  console.log('- 已保存拼音字母关联数据');

  await sqlite.generatePinyinCharTree(db3, pinyinCharTreeFile);
  console.log('- 已保存拼音字母后继数据');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db3);
}
console.log();
