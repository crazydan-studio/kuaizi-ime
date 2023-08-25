import { fromRootPath, appendLineToFile } from '../../utils/utils.mjs';

import { fetchEmojis } from './emoji.mjs';

const emojiDataFile = fromRootPath('data', 'emojis.json');

console.log();
console.log('抓取表情符号 ...');
const emojiGroups = await fetchEmojis();
console.log('- 已抓取表情分类总数：' + emojiGroups.length);
console.log(
  '- 已抓取表情符号总数：' +
    emojiGroups.reduce((r, group) => r + group.emojis.length, 0)
);
console.log();

console.log();
console.log('保存表情符号 ...');
appendLineToFile(emojiDataFile, JSON.stringify(emojiGroups), true);
console.log('- 保存成功');
console.log();
