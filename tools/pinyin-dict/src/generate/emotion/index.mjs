import { fromRootPath, appendLineToFile } from '../../utils/utils.mjs';

import { fetchEmotions } from './emotion.mjs';

const emotionDataFile = fromRootPath('data', 'emotions.json');

console.log();
console.log('抓取表情符号 ...');
const emotionGroups = await fetchEmotions();
console.log('- 已抓取表情分类总数：' + emotionGroups.length);
console.log(
  '- 已抓取表情符号总数：' +
    emotionGroups.reduce((r, group) => r + group.emotions.length, 0)
);
console.log();

console.log();
console.log('保存表情符号 ...');
appendLineToFile(emotionDataFile, JSON.stringify(emotionGroups), true);
console.log('- 保存成功');
console.log();
