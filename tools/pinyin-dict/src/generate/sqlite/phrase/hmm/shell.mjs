/* SQLite 词典库 */
import { fromRootPath, copyFile } from '#utils/utils.mjs';
import * as sqlite from './sqlite.mjs';
import { input, select } from '@inquirer/prompts';

// SQLite 词典库
const phraseDictSQLiteFile = fromRootPath('data', 'pinyin-phrase-dict.sqlite');
// 用户数据库
const userDictSQLiteFile = fromRootPath(
  'data',
  'pinyin-phrase-dict.user.sqlite'
);
copyFile(phraseDictSQLiteFile, userDictSQLiteFile);

console.log();
let userDictDB = await sqlite.open(userDictSQLiteFile);

await sqlite.attach(userDictDB, {
  // SQLite 字典库：通过 attach database 连接字典库，
  // 两个库中的非同名表可以直接使用，无需通过连接名称区分
  // Note：性能不太好
  word: fromRootPath('data', 'pinyin-word-dict.sqlite')
});

try {
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
