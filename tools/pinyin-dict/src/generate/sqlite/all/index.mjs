/* 含完整信息的 SQLite 数据库 */
import { fromRootPath, readLineFromFile } from '../../../utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

const dictDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');
const emotionDataFile = fromRootPath('data', 'emotions.json');
// 包含完整拼音和字信息的 SQLite 数据库
const dictDataSQLiteFile = fromRootPath('data', 'pinyin-dict.all.sqlite');

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
let db = await sqlite.open(dictDataSQLiteFile);

try {
  await sqlite.saveSpells(db, wordMetas);
  console.log('- 已保存字读音信息');

  await sqlite.saveWords(db, wordMetas);
  console.log('- 已保存字信息');

  await sqlite.savePhrases(db, wordMetas);
  console.log('- 已保存词组信息');
} catch (e) {
  console.error(e);
} finally {
  await sqlite.close(db);
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
db = await sqlite.open(dictDataSQLiteFile);
try {
  await sqlite.saveEmotions(db, emotionMetas);
  console.log('- 已保存表情符号数据');
} catch (e) {
  console.error(e);
} finally {
  await sqlite.close(db);
}
console.log();
