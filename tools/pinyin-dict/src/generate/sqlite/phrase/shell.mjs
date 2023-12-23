/* SQLite 词典库 */
import { fromRootPath } from '../../../utils/utils.mjs';
import * as sqlite from './sqlite.mjs';
import { input, select } from '@inquirer/prompts';

// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');

console.log();
let phraseDictDB = await sqlite.open(phraseDictSQLiteFile, true);

await sqlite.attach(phraseDictDB, {
  // SQLite 字典库：通过 attach database 连接字典库，
  // 两个库中的非同名表可以直接使用，无需通过连接名称区分
  // Note：性能不太好
  word: fromRootPath('data', 'pinyin-word-dict.sqlite')
});

try {
  while (await start(phraseDictDB)) {}
} catch (e) {
  throw e;
} finally {
  await sqlite.close(phraseDictDB);
}

console.log();

async function start(phraseDictDB) {
  // https://github.com/SBoudrias/Inquirer.js
  let answer = await input({
    message: '请输入拼音，拼音之间以空格分隔:'
  });

  const pinyin = answer.trim();
  if (!pinyin) {
    return false;
  }

  const chars = pinyin.split(/\s+/g);
  const words = await sqlite.predict(phraseDictDB, chars);

  answer = await select({
    message: '请选择最佳的匹配结果:',
    choices: [
      {
        name: 'npm',
        value: 'npm',
        description: 'npm is the most popular package manager'
      },
      {
        name: 'yarn',
        value: 'yarn',
        description: 'yarn is an awesome package manager'
      }
    ],
    choices: words.map((w, i) => ({
      name: w[1].map(({ value }) => value).join(''), // 显示内容
      value: w[1], // 函数返回内容
      // 选中时的提示内容
      description: `${i + 1}: (${w[0]}) ${w[1]
        .map(({ value, spell }) => `${value} - ${spell}`)
        .join(', ')}`
    }))
  });
  console.log(answer);

  return true;
}
