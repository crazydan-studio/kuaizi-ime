/* 生成 HMM 计算参数 */
import {
  fromRootPath,
  appendLineToFile,
  readLineFromFile,
  getAllFiles,
  readFile,
  asyncForEach
} from '#utils/utils.mjs';
import { openDB, closeDB } from '#utils/sqlite.mjs';
import { readWordsFromDB } from '../utils.mjs';
import * as trans from './trans.mjs';

// 训练课文数据
let phraseSamplesDir = '';
let appendExistData = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg == '-f') {
    phraseSamplesDir = args[++i];
  } else if (arg == '-a') {
    appendExistData = true;
  }
}

if (!phraseSamplesDir) {
  console.log(
    'Usage: npm run generate:sqlite:phrase:hmm:trans_kewen -- [-a] -f /path/to/samples/file'
  );
  console.log();

  process.exit(1);
}

// SQLite 字典库
const wordDictSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');
// HMM 参数目录
const transParamsDir = fromRootPath('data', 'hmm_params/kewen');

console.log();
console.log('创建计算参数 ...');
let wordDictDB = await openDB(wordDictSQLiteFile, true);

let words;
try {
  words = await readWordsFromDB(wordDictDB);
} catch (e) {
  throw e;
} finally {
  await closeDB(wordDictDB);
}

let transParams;
await asyncForEach(getAllFiles(phraseSamplesDir), async (file) => {
  console.log(`  - 分析文件: ${file} ...`);

  await readLineFromFile(file, (line) => {
    if (!line || !line.trim()) {
      return;
    }

    const json = JSON.parse(line);
    transParams = trans.countParams(json, words, transParams);
  });
});

Object.keys(transParams).forEach((name) => {
  appendLineToFile(
    transParamsDir + `/${name}.json`,
    JSON.stringify(transParams[name], null, 2),
    true
  );
});

console.log();
console.log('Done');
console.log();
