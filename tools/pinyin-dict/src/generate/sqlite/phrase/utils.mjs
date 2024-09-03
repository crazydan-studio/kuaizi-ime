import { pinyin as get_pinyin } from 'pinyin';

// extract_phrases('力争达到１０００万标准箱\n', {
//   力: true,
//   争: true,
//   达: true,
//   到: true,
//   万: true,
//   标: true,
//   准: true,
//   箱: true
// });
/** 拆分样本数据，按汉字短句返回 */
export function extract_phrases(sampleText, words) {
  const phrases = [];
  const excludes = ['丨'];

  let phrase_size = 0;
  const total = sampleText.length;
  for (let i = 0; i <= total; i++) {
    const word = sampleText.charAt(i);

    if (
      word == ' ' ||
      (sampleText.charAt(i + 1) == 'o' && word == '/') ||
      (sampleText.charAt(i - 1) == '/' && word == 'o') ||
      (words[word] && !excludes.includes(word))
    ) {
      phrase_size += 1;
      continue;
    }

    const phrase = sampleText
      .substring(i - phrase_size, i)
      .replaceAll(' ', '')
      .replaceAll('/o', '');
    phrase_size = 0;

    // 不忽略单字
    if (phrase.length < 1) {
      continue;
    }

    // https://www.npmjs.com/package/pinyin/v/3.1.0
    let pinyins_array = get_pinyin(phrase, {
      // 启用多音字模式：单字不启用
      heteronym: phrase.length > 1,
      // 启用分词，以解决多音字问题
      segment: 'nodejieba',
      // 输出拼音格式：含声调，如，pīn yīn
      style: get_pinyin.STYLE_TONE,
      // 紧凑模式：你好吗 -> [ [nǐ,hǎo,ma], [nǐ,hǎo,má], ... ]
      compact: true
    })[0];

    console.log(`  - 获取拼音 for ${phrase} ...`);

    // 直接按 字:拼音 进行统计，故，无需再计算 拼音-汉字发射概率
    if (!Array.isArray(pinyins_array[0])) {
      pinyins_array = [pinyins_array];
    }

    pinyins_array.forEach((pinyins) => {
      phrases.push(correct_pinyin(phrase, pinyins));
    });
  }

  return phrases;
}

function correct_pinyin(phrase, pinyins) {
  return pinyins.map((pinyin, index) => {
    let word = phrase.charAt(index);
    const prev_word = phrase.charAt(index - 1);
    const post_word = phrase.charAt(index + 1);

    if (word == '不' && ['bú', 'bū'].includes(pinyin)) {
      pinyin = 'bù';
    } else if (word == '么' && pinyin == 'mǒ') {
      pinyin = 'me';
    } else if (word == '什' && pinyin == 'shèn') {
      pinyin = 'shén';
    } else if (word == '进' && pinyin == 'jǐn') {
      pinyin = 'jìn';
    } else if (word == '骨' && pinyin == 'gú') {
      pinyin = 'gǔ';
    } else if (word == '喝' && pinyin == 'he') {
      pinyin = 'hē';
    } else if (word == '尘' && pinyin == 'chen') {
      pinyin = 'chén';
    } else if (word == '乌' && pinyin == 'wù') {
      pinyin = 'wū';
    } else if (word == '滂' && pinyin == 'páng') {
      pinyin = 'pāng';
    } else if (word == '坊' && pinyin == 'fang') {
      pinyin = 'fáng';
    } else if (word == '场' && pinyin == 'chang') {
      pinyin = 'chǎng';
    } else if (word == '唔' && pinyin == 'wù') {
      pinyin = 'wú';
    } else if (word == '唬' && pinyin == 'hu') {
      pinyin = 'hǔ';
    } else if (word == '嚷' && pinyin == 'rang') {
      pinyin = 'rǎng';
    } else if (word == '混' && pinyin == 'gǔn') {
      pinyin = 'hùn';
    } else if (word == '㩗' && pinyin == 'xí') {
      pinyin = 'xié';
    } else if (word == '约' && pinyin == 'yué') {
      pinyin = 'yuē';
    } else if (word == '亡' && pinyin == 'bēn') {
      pinyin = 'wáng';
    } else if (word == '只' && pinyin == 'yán') {
      pinyin = 'zhǐ';
    } else if (word == '节' && pinyin == 'jíe') {
      pinyin = 'jié';
    } else if (word == '铛' && pinyin == 'dang') {
      pinyin = 'dāng';
    } else if (word == '价' && pinyin == 'wù') {
      pinyin = 'jià';
    } else if (word == '打' && pinyin == 'dā') {
      pinyin = 'dǎ';
    } else if (word == '傅' && pinyin == 'fū') {
      pinyin = 'fù';
    } else if (word == '裳' && pinyin == 'shāng') {
      pinyin = 'shang';
    } else if (word == '瘩' && pinyin == 'dā') {
      pinyin = 'da';
    } else if (word == '荷' && pinyin == 'he') {
      pinyin = 'hé';
    } else if (word == '结' && pinyin == 'jì') {
      pinyin = 'jié';
    } else if (word == '叨' && pinyin == 'dáo') {
      pinyin = 'dāo';
    } else if (word == '大' && pinyin == 'dǎ') {
      pinyin = 'dà';
    } else if (word == '雀' && pinyin == 'qué') {
      pinyin = 'què';
    } else if (word == '属' && pinyin == 'shú') {
      pinyin = 'shǔ';
    } else if (word == '溜' && pinyin == 'liú') {
      pinyin = 'liū';
    } else if (word == '约' && pinyin == 'yuè') {
      pinyin = 'yuē';
    } else if (word == '绰' && pinyin == 'chuō') {
      pinyin = 'chuò';
    } else if (word == '卒' && pinyin == 'fú') {
      pinyin = 'zú';
    } else if (word == '囊' && pinyin == 'nang') {
      pinyin = 'náng';
    } else if (word == '趄' && pinyin == 'qie') {
      pinyin = 'qiè';
    } else if (word == '挑' && pinyin == 'tāo') {
      pinyin = 'tiāo';
    } else if (word == '了' && pinyin == 'liào') {
      pinyin = 'le';
    } else if (word == '绰' && pinyin == 'chuo') {
      pinyin = 'chuò';
    } else if (word == '其' && pinyin == 'qì') {
      pinyin = 'qí';
    } else if (word == '吾' && ['wū', 'wǔ'].includes(pinyin)) {
      pinyin = 'wú';
    } else if (word == '蛾' && pinyin == 'ér') {
      pinyin = 'é';
    } else if (word == '沙' && pinyin == 'sha') {
      pinyin = 'shā';
    } else if (word == '沓' && pinyin == 'ta') {
      pinyin = 'tà';
    } else if (word == '血' && pinyin == 'xuě') {
      pinyin = 'xuè';
    } else if (word == '罢' && pinyin == 'bā') {
      pinyin = 'bà';
    } else if (word == '羊' && pinyin == 'yán') {
      pinyin = 'yáng';
    } else if (word == '澄' && pinyin == 'deng') {
      pinyin = 'chéng';
    } else if (word == '䀏' && pinyin == 'xiàn') {
      word = '旬';
    } else if (word == '乘' && pinyin == 'chèng') {
      pinyin = 'chéng';
    } else if (word == '当' && pinyin == 'dang') {
      pinyin = 'dāng';
    } else if (word == '责' && pinyin == 'zè') {
      pinyin = 'zé';
    } else if (word == '钉' && pinyin == 'ding') {
      pinyin = 'dīng';
    } else if (word == '罗' && pinyin == 'luò') {
      pinyin = 'luó';
    } else if (word == '㘝' && pinyin == 'niǎn') {
      pinyin = 'lǎn';
    } else if (word == '僝' && pinyin == 'zhàn') {
      pinyin = 'chán';
    } else if (word == '焸' && pinyin == 'xiǒng' && !post_word) {
      pinyin = 'gǔ';
    } else if (word == '炰' && pinyin == 'fèng' && post_word == '鳖') {
      pinyin = 'fǒu';
    } else if (word == '条' && pinyin == 'dí') {
      pinyin = 'tiáo';
    } else if (word == '分' && pinyin == 'fān') {
      pinyin = 'fēn';
    } else if (word == '虾' && pinyin == 'há') {
      word = '蛤';
    } else if (word == '屛' && pinyin == 'pǐng') {
      word = '屏';
      pinyin = ['住'].includes(post_word) ? 'bǐng' : 'píng';
    } else if (word == '不' && pinyin == 'bǔ') {
      pinyin = 'bù';
    } else if (word == '泥' && pinyin == 'niè') {
      pinyin = 'ní';
    } else if (word == '难' && pinyin == 'nan') {
      pinyin = ['发', '逃', '灾', '空'].includes() ? 'nàn' : 'nán';
    } else if (word == '大' && pinyin == 'dā') {
      pinyin = 'dà';
    } else if (word == '同' && pinyin == 'rú') {
      word = '如';
    } else if (word == '着' && pinyin == 'zhaō') {
      pinyin = ['胶'].includes(prev_word) ? 'zhuó' : 'zhe';
    } else if (word == '宜' && pinyin == 'yì') {
      pinyin = 'yí';
    } else if (word == '摩' && post_word == '挲') {
      pinyin = 'mó';
    } else if (word == '挲' && pinyin == 'sā') {
      pinyin = prev_word == '摩' ? 'suō' : 'shā';
    } else if (word == '薄' && pinyin == 'bù') {
      if (prev_word == '对' && post_word == '公') {
        word = '簿';
      } else {
        pinyin = 'bó';
      }
    } else if (word == '家' && ['jiān', 'ji'].includes(pinyin)) {
      // console.log('读音修正: ', phrase, pinyins);
      pinyin = 'jiā';
    } else if (word == '难' && pinyin == 'cái') {
      // console.log('读音修正: ', phrase, pinyins);
      pinyin = 'nán';
    } else if (word == '读' && pinyin == 'shū') {
      // console.log('读音修正: ', phrase, pinyins);
      pinyin = 'dú';
    } else if (word == '教' && pinyin == 'jiàn') {
      // console.log('读音修正: ', phrase, pinyins);
      pinyin = prev_word == '屡' ? 'jiào' : 'jiāo';
    } else if (word == '唠') {
      pinyin = 'láo';
    } else if (word == '干' && pinyin == 'qián') {
      pinyin = ['晒', '物'].includes(prev_word) ? 'gān' : 'gàn';
    } else if (word == '长' && pinyin == 'chéng') {
      pinyin = [
        '增',
        '院',
        '成',
        '书',
        '事',
        '彼',
        '家',
        '会',
        '处',
        '学',
        '局',
        '市',
        '组'
      ].includes(prev_word)
        ? 'zhǎng'
        : 'cháng';
    } else if (word == '行' && pinyin == 'héng') {
      pinyin = ['银', '央', '工', '农', '该', '逐', '排'].includes(prev_word)
        ? 'háng'
        : 'xíng';
    } else if (word == '蒙' && pinyin == 'meng') {
      pinyin = post_word == '古' ? 'měng' : 'méng';
    } else if (word == '一' && ['yí', 'yì'].includes(pinyin)) {
      pinyin = 'yī';
    } else if (word == '拉' && ['là', 'la'].includes(pinyin)) {
      pinyin = 'lā';
    }

    return `${word}:${pinyin}`;
  });
}
