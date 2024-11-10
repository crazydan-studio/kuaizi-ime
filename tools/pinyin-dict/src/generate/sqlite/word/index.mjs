/* SQLite 字典库 */
import {
  fromRootPath,
  readLineFromFile,
  extractPinyinChars
} from '#utils/utils.mjs';
import * as sqlite from './sqlite.mjs';

// 收集数据
const wordDataValidFile = fromRootPath('data', 'pinyin-dict.valid.txt');
const emojiDataFile = fromRootPath('data', 'emojis.json');
// 分析数据
const pinyinCharsFile = fromRootPath('..', 'analyze/files/pinyin.txt');
const pinyinCharLinksFile = fromRootPath('..', 'analyze/files/char-links.json');
const pinyinCharTreeFile = fromRootPath('..', 'analyze/files/char-tree.json');

// SQLite 字典库
const wordDictDataSQLiteFile = fromRootPath('data', 'pinyin-word-dict.sqlite');

console.log();
console.log('读取已收集的有效字信息 ...');
const wordMetas = [];
await readLineFromFile(wordDataValidFile, (line) => {
  if (!line || !line.trim()) {
    return;
  }

  const metas = JSON.parse(line);
  metas.forEach((meta) => {
    wordMetas.push(meta);

    // 单独修正输入数据
    const deleted = [
      '虾:hā' // -> 虾:há
    ];
    const added = [
      // “一”和“不”变调有规律：https://www.chinanews.com.cn/hwjy/news/2010/04-15/2228742.shtml
      '不:bú',
      '一:yì',
      '一:yí',
      '子:zi',
      // 便宜：pián yi
      '宜:yi',
      '噷:hm',
      '吒:zhà',
      '虎:hu',
      '枸:gōu',
      '焘:tāo',
      '喇:lā',
      '喇:lá',
      '蕃:bō',
      '蕃:fān',
      '脯:pú',
      '蕻:hóng',
      '朵:duo',
      '鏜:táng',
      '咔:kā',
      '蹬:dèng',
      '爸:ba',
      '叔:shu',
      '喝:he',
      // 《定风波·自春来》 - 无那。恨薄情一去，音书无个
      // https://www.cngwzj.com/pygushi/SongDai/48900/
      '那:nuó',
      // 《桂枝香·金陵怀古》 - 谩嗟荣辱
      // https://www.cngwzj.com/pygushi/SongDai/49417/
      '谩:màn',
      // 《贺新郎·春情》 - 殢酒厌厌病
      // https://www.cngwzj.com/pygushi/SongDai/61645/
      '厌:yǎn',
      // 《贺新郎·春情》 - 断鸿难倩
      // https://www.cngwzj.com/pygushi/SongDai/61645/
      '倩:qìng',
      // 《八声甘州·记玉关踏雪事清游》 - 长河饮马
      // https://www.cngwzj.com/pygushi/SongDai/61043/
      '饮:yìn',
      // 王维《青溪》 - 趣途无百里
      // https://www.cngwzj.com/pygushi/TangDai/10982/
      '趣:qū',
      // 李白《关山月》 - 戍客望边色
      // https://www.cngwzj.com/pygushi/TangDai/12860/
      '色:yì',
      // 《听董大弹胡笳声兼寄语弄房给事》 - 四郊秋叶惊摵摵
      // https://www.cngwzj.com/pygushi/TangDai/11474/
      '摵:shè',
      // 白居易《琵琶行》 - 自言本是京城女，家在虾蟆陵下住
      // https://www.cngwzj.com/pygushi/TangDai/25273/
      '虾:há',
      // 李白《将进酒》
      // https://www.cngwzj.com/pygushi/TangDai/12843/
      '将:qiāng',
      // 《行经华阴》- 借问路傍名利客
      // https://www.cngwzj.com/pygushi/TangDai/11353/
      '傍:páng',
      // 王维《鹿柴》
      // https://www.cngwzj.com/pygushi/TangDai/11206/
      '柴:zhài'
    ]
      .map((w) => w.split(':'))
      .map((s) => ({
        value: s[0],
        pinyin: s[1],
        chars: extractPinyinChars(s[1])
      }));

    [].concat(added).forEach(({ value, pinyin, chars }) => {
      if (
        meta.value == value &&
        meta.pinyins.filter(({ value }) => value == pinyin).length == 0
      ) {
        meta.pinyins.push({ value: pinyin, chars });
      }
    });

    deleted
      .map((w) => w.split(':'))
      .forEach((s) => {
        if (meta.value == s[0]) {
          meta.pinyins = meta.pinyins.filter(({ value }) => value !== s[1]);
        }
      });
  });
});
console.log('- 有效字信息总数：' + wordMetas.length);
console.log();

console.log();
console.log('写入字信息到 SQLite ...');
let db1 = await sqlite.open(wordDictDataSQLiteFile);

try {
  await sqlite.saveSpells(db1, wordMetas);
  console.log('- 已保存字读音信息');

  await sqlite.saveWords(db1, wordMetas);
  console.log('- 已保存字信息');

  await sqlite.savePhrases(db1, wordMetas);
  console.log('- 已保存词组信息');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db1);
}

console.log();

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

console.log();
console.log('写入表情符号到 SQLite ...');
let db2 = await sqlite.open(wordDictDataSQLiteFile);
try {
  await sqlite.saveEmojis(db2, groupEmojiMetas);
  console.log('- 已保存表情符号数据');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db2);
}
console.log();

console.log();
console.log('通过 SQLite 生成分析数据 ...');
let db3 = await sqlite.open(wordDictDataSQLiteFile);
try {
  await sqlite.generatePinyinChars(db3, pinyinCharsFile);
  console.log('- 已保存拼音字母组合数据');

  await sqlite.generatePinyinCharLinks(db3, pinyinCharLinksFile);
  console.log('- 已保存拼音字母关联数据');

  await sqlite.generatePinyinCharTree(db3, pinyinCharTreeFile);
  console.log('- 已保存拼音字母后继数据');
} catch (e) {
  throw e;
} finally {
  await sqlite.close(db3);
}
console.log();
