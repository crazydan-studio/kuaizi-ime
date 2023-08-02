/* 含完整信息的 SQLite 数据库 */
import { fromRootPath, readLineFromFile } from '../../../utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

const dictDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');
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
console.log('写入数据到 SQLite ...');
const db = await sqlite.open(dictDataSQLiteFile);

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
