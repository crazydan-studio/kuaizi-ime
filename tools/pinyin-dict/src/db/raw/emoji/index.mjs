import { fromRootPath, readLineFromFile } from '#utils/utils.mjs';
import { getWordDictSQLiteFile } from '#db/utils.mjs';

import * as sqlite from './sqlite.mjs';

// 收集数据
const emojiDataFile = fromRootPath('data', 'emojis.json');

// SQLite 字典库
const wordDictSQLiteFile = getWordDictSQLiteFile();

// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
console.log();
console.log('写入表情符号到 SQLite ...');

const db = sqlite.open(wordDictSQLiteFile);
try {
  sqlite.saveEmojis(db, groupEmojiMetas);
  console.log('- 已保存表情符号数据');
} catch (e) {
  throw e;
} finally {
  sqlite.close(db);
}

console.log();
