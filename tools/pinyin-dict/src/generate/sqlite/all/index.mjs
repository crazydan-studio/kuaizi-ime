/* 含完整信息的 SQLite 数据库 */
import { fromRootPath, readLineFromFile } from '../../../utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

const dictDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');
const emotionDataFile = fromRootPath('data', 'emotions.json');
// 包含完整拼音和字信息的 SQLite 数据库
const dictDataSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');
// 分析数据
const pinyinCharsFile = fromRootPath('../..', 'analyze/files/pinyin.txt');
const pinyinCharLinksFile = fromRootPath(
  '../..',
  'analyze/files/char-links.json'
);
const pinyinNextCharLinksFile = fromRootPath(
  '../..',
  'analyze/files/next-char-links.json'
);

console.log();
console.log('读取已收集的有效字信息 ...');
const wordMetas = [];
await readLineFromFile(dictDataValidFile, (line) => {
  if (!line || !line.trim()) {
    return;
  }

  const metas = JSON.parse(line);
  metas.forEach((meta) => {
    wordMetas.push(meta);
  });
});
console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

console.log();
console.log('写入字信息到 SQLite ...');
let db1 = await sqlite.open(dictDataSQLiteFile);

try {
  await sqlite.saveSpells(db1, wordMetas);
  console.log('- 已保存字读音信息');

  await sqlite.saveWords(db1, wordMetas);
  console.log('- 已保存字信息');

  await sqlite.savePhrases(db1, wordMetas);
  console.log('- 已保存词组信息');
} catch (e) {
  console.error(e);
} finally {
  await sqlite.close(db1);
}

console.log();

console.log();
console.log('读取已收集的表情符号 ...');
const emotionMetas = [];
await readLineFromFile(emotionDataFile, (line) => {
  if (!line || !line.trim()) {
    return;
  }

  const groups = JSON.parse(line);
  groups.forEach((group) => {
    group.emotions.forEach((emotion) => {
      emotionMetas.push(emotion);
    });
  });
});
console.log('- 表情符号总数：' + emotionMetas.length);
console.log();

console.log();
console.log('写入表情符号到 SQLite ...');
let db2 = await sqlite.open(dictDataSQLiteFile);
try {
  await sqlite.saveEmotions(db2, emotionMetas);
  console.log('- 已保存表情符号数据');
} catch (e) {
  console.error(e);
} finally {
  await sqlite.close(db2);
}
console.log();

console.log();
console.log('通过 SQLite 生成分析数据 ...');
let db3 = await sqlite.open(dictDataSQLiteFile);
try {
  await sqlite.generatePinyinChars(db3, pinyinCharsFile);
  console.log('- 已保存拼音字母组合数据');

  await sqlite.generatePinyinCharLinks(db3, pinyinCharLinksFile);
  console.log('- 已保存拼音字母关联数据');

  await sqlite.generatePinyinNextCharLinks(db3, pinyinNextCharLinksFile);
  console.log('- 已保存拼音字母后继数据');
} catch (e) {
  console.error(e);
} finally {
  await sqlite.close(db3);
}
console.log();
