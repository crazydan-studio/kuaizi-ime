/* SQLite 词典库 */
import { fromRootPath, existFile } from '#utils/utils.mjs';
import { input, select } from '@inquirer/prompts';

import * as sqlite from './sqlite.mjs';

// 用户字典库
const userDictSQLiteFile = fromRootPath('data', 'pinyin-user-dict.sqlite');

console.log();
console.log('初始化用户字典 ...');
const needToInitUserDict = !existFile(userDictSQLiteFile);
const userDictDB = await sqlite.open(userDictSQLiteFile);

// 通过 attach database 连接字典、词典库，
// 库中的非同名表可以直接使用，无需通过连接名称区分
// Note：性能不太好
await sqlite.attach(userDictDB, {
  // 应用字典库
  word: fromRootPath('data', 'pinyin-word-dict.sqlite'),
  // 应用词典库
  phrase: fromRootPath('data', 'pinyin-phrase-dict.sqlite')
});

try {
  if (needToInitUserDict) {
    await sqlite.init(userDictDB);
  }
  console.log();

  while ((await start(userDictDB)) !== false) {}
} catch (e) {
  throw e;
} finally {
  await sqlite.close(userDictDB);
}

console.log();

async function start(userDictDB) {
  // https://github.com/SBoudrias/Inquirer.js
  const pinyin = (
    await input({
      message: '请输入拼音，拼音之间以空格分隔（输入 exit 退出）:'
    })
  ).trim();

  if (!pinyin) {
    return true;
  } else if (pinyin === 'exit') {
    return false;
  }

  const chars = pinyin.split(/\s+/g);
  const words = await sqlite.predict(userDictDB, chars);

  const selectedPhrase = await select({
    message: '请选择最佳的匹配结果:',
    choices: words.map((w, i) => ({
      name: w[1].map(({ value }) => value).join(''), // 显示内容
      value: w[1], // 函数返回内容
      // 选中时的提示内容
      description: `${i + 1}: (${w[0]}) ${w[1]
        .map(({ value, spell }) => `${value} - ${spell}`)
        .join(', ')}`
    }))
  });

  while (true) {
    const selectedWord = await select({
      message: '请选择待修改的字:',
      choices: [
        { name: '[结束修改]', value: { index: -1, word: { id: 0 } } }
      ].concat(
        selectedPhrase.map((w, i) => ({
          name: w.id == 0 ? `{w.value}` : `${w.value} - ${w.spell}`,
          value: { index: i, word: w }
        }))
      )
    });

    if (selectedWord.index < 0) {
      break;
    }

    const selectedCandidate = await select({
      message: `请修改选中的字 [${selectedWord.index + 1}: ${
        selectedWord.word.value
      }]:`,
      choices: selectedWord.word.get_candidates().map((w) => ({
        name: `${w.value} - ${w.spell}`,
        value: w,
        description: `    ${w.value}: ${w.id}, ${w.spell}`
      }))
    });

    selectedPhrase[selectedWord.index] = selectedCandidate;
  }

  sqlite.saveUsedPhrase(userDictDB, selectedPhrase);

  console.log(
    '  最终确认结果为: ',
    chars.join(' '),
    '->',
    selectedPhrase.map(({ value, spell }) => `${value}(${spell})`).join('|')
  );
  console.log();
}
