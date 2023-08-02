import got from 'got';
import { JSDOM } from 'jsdom';

import { sleep, splitChars, hasGlyphFontForCodePoint } from './utils.mjs';

// 根据 zdic.net 获取字的详细数据
const baseUrl = 'https://www.zdic.net/hans/';
const gotOptions = { timeout: { connect: 50000 } };

export async function fetchWordMetas(words) {
  return await Promise.all(words.map(fetchWordMeta));
}

async function fetchWordMeta(word) {
  const srcUrl = baseUrl + word;
  // const html = await (await fetch(srcUrl)).text();
  const html = await got(srcUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return { value: word };
  }

  const wordMeta = {
    value: word,
    unicode: '',
    src_url: srcUrl,
    glyph_svg_url: '',
    glyph_gif_url: '',
    glyph_struct: '',
    glyph_font_exists: true,
    // 注音与拼音的区别和历史: https://sspai.com/post/75248
    pinyins: [],
    zhuyins: [],
    radical: '',
    stroke_order: '',
    total_stroke_count: 0,
    radical_stroke_count: 0,
    traditional: false,
    simple_words: [],
    variant_words: [],
    traditional_words: [],
    wubi_codes: [],
    cangjie_codes: [],
    zhengma_codes: [],
    sijiao_codes: [],
    phrases: []
  };

  // 字形图片和笔顺动画
  const $img = $doc.querySelector('.ziif .zipic img');
  if ($img) {
    const src = $img.getAttribute('src');
    const gif = $img.getAttribute('data-gif');

    src && (wordMeta.glyph_svg_url = 'https:' + src);
    gif && (wordMeta.glyph_gif_url = 'https:' + gif);
  }

  // 拼音
  const $pinyin = $doc.querySelectorAll('.ziif .dsk .z_py .z_d');
  $pinyin.forEach(($el) => {
    const value = naiveInnerText($el).trim();
    const $audio = $el.querySelector('a[data-src-mp3]');
    const audio = ($audio && $audio.getAttribute('data-src-mp3')) || '';

    wordMeta.pinyins.push({
      value,
      audio_url: audio ? 'https:' + audio : ''
    });
  });

  // 注音，与拼音按顺序对应
  const $zhuyin = $doc.querySelectorAll('.ziif .dsk .z_zy .z_d');
  $zhuyin.forEach(($el) => {
    const value = naiveInnerText($el).trim();
    const $audio = $el.querySelector('a[data-src-mp3]');
    const audio = ($audio && $audio.getAttribute('data-src-mp3')) || '';

    wordMeta.zhuyins.push({
      value,
      audio_url: audio ? 'https:' + audio : ''
    });
  });

  // 总笔画数
  const $totalStrokeCount = $doc.querySelector('.ziif .dsk .z_bs2 .z_ts3');
  $totalStrokeCount &&
    (wordMeta.total_stroke_count = parseInt(
      naiveInnerText($totalStrokeCount.parentElement)
        .replaceAll(/^.+\s+/g, '')
        .trim()
    ));

  // 部首、部外笔画数
  const $radical = $doc.querySelectorAll('.ziif .dsk .z_bs2 .z_ts2');
  $radical.forEach(($el) => {
    const text = naiveInnerText($el.parentElement);
    const value = text.replaceAll(/^.+\s+/g, '').trim();

    if (text.includes('部首')) {
      wordMeta.radical = value;
    } else if (text.includes('部外')) {
      wordMeta.radical_stroke_count = Math.max(
        0,
        wordMeta.total_stroke_count - parseInt(value)
      );
    }
  });

  // 简繁字
  const $jianfan = $doc.querySelectorAll('.ziif .dsk .z_jfz > p > a');
  $jianfan.forEach(($el) => {
    if ($el.querySelector('img')) {
      return;
    }

    const parentText = naiveInnerText($el.parentElement);
    const value = naiveInnerText($el).trim();

    if (parentText.includes('繁体')) {
      wordMeta.traditional = false;
      wordMeta.traditional_words = value.split(/\s+/g);
    } else if (parentText.includes('简体')) {
      wordMeta.traditional = true;
      wordMeta.simple_words = value.split(/\s+/g);
    }
  });

  // 异体字
  const $variant = $doc.querySelectorAll('.ziif .dsk .z_ytz2 > a');
  $variant.forEach(($el) => {
    if ($el.querySelector('img')) {
      return;
    }

    const value = naiveInnerText($el).trim();
    wordMeta.variant_words.push(value);
  });

  // 笔顺
  const $strokeOrder = $doc.querySelector('.ziif .dsk .z_bis2');
  $strokeOrder && (wordMeta.stroke_order = naiveInnerText($strokeOrder).trim());

  // 编码信息
  const codeTitles = [];
  const $codeTitle = $doc.querySelectorAll('.ziif .dsk .dsk_2_1 > p > span');
  $codeTitle.forEach(($el) => {
    const value = naiveInnerText($el).trim();

    codeTitles.push(value);
  });

  const codes = [];
  $doc.querySelectorAll('.ziif .dsk .dsk_2_1').forEach(($el) => {
    const value = naiveInnerText($el).trim();

    if (!codeTitles.includes(value)) {
      codes.push(value);
    }
  });
  for (let i = 0; i < codeTitles.length; i++) {
    const title = codeTitles[i];
    const value = codes[i];

    if (title === '统一码') {
      wordMeta.unicode = value.replaceAll(/^.+(U\+.+)\s*/g, '$1');
    } else if (title === '字形分析') {
      wordMeta.glyph_struct = value;
    } else if (title === '五笔') {
      wordMeta.wubi_codes = value.split(/\|/g);
    } else if (title === '仓颉') {
      wordMeta.cangjie_codes = value.split(/\|/g);
    } else if (title === '郑码') {
      wordMeta.zhengma_codes = value.split(/\|/g);
    } else if (title === '四角') {
      wordMeta.sijiao_codes = value.split(/\|/g);
    }
  }

  wordMeta.glyph_font_exists = hasGlyphFontForCodePoint(wordMeta.unicode);

  // 词组、短语
  const phrases = [];
  const $phrase = $doc.querySelectorAll('.crefe');
  $phrase.forEach((el) => {
    const text = naiveInnerText(el).trim();

    phrases.push(text);
  });

  const batchSize = 10;
  for (let i = 0; i < phrases.length; i += batchSize) {
    const phraseMetas = await Promise.all(
      phrases.slice(i, i + batchSize).map(fetchPhraseMeta)
    );

    phraseMetas.forEach((phrase) => {
      wordMeta.phrases.push(...phrase);
    });

    await sleep(1500);
  }

  return wordMeta;
}

function naiveInnerText(node) {
  // https://github.com/jsdom/jsdom/issues/1245#issuecomment-1243809196
  // We need Node(DOM's Node) for the constants,
  // but Node doesn't exist in the nodejs global space,
  // and any Node instance references the constants
  // through the prototype chain
  const Node = node;

  return node && node.childNodes
    ? [...node.childNodes]
        .map((node) => {
          switch (node.nodeType) {
            case Node.TEXT_NODE:
              return node.textContent;
            case Node.ELEMENT_NODE:
              return naiveInnerText(node);
            default:
              return '';
          }
        })
        .join(' ')
    : '';
}

async function fetchPhraseMeta(phrase) {
  const srcUrl = baseUrl + phrase;
  // const html = await (await fetch(srcUrl)).text();
  const html = await got(srcUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;

  // https://www.zdic.net/hans/不塞不流，不止不行
  const phrases = phrase.split(/[，,、；]/g);
  const phraseCharsArray = phrases
    .map((p) => splitChars(p))
    .filter((p) => p.length > 1);
  if (!$doc || phraseCharsArray.length === 0) {
    return phraseCharsArray.map((p) => ({
      value: p,
      pinyins: [],
      zhuyins: []
    }));
  }

  // 拼音及注音
  const pinyinsArray = [];
  const zhuyinsArray = [];
  const $duyin = $doc.querySelectorAll('.ciif p .z_ts2');
  $duyin.forEach(($el) => {
    const text = naiveInnerText($el);
    const $dicpy = $el.parentElement.querySelectorAll('.dicpy');

    $dicpy.forEach(($e) => {
      naiveInnerText($e)
        .split(/[，,；]/g)
        .forEach((val) => {
          const splits = val.replaceAll(/\s+([ˊˇˋˉ])/g, '$1').split(/\s+/g);

          if (text === '拼音') {
            pinyinsArray.push({ value: splits });
          } else if (text === '注音') {
            zhuyinsArray.push({ value: splits });
          }
        });
    });
  });

  const metas = [];
  if (pinyinsArray.length === 0) {
    return metas;
  }

  phraseCharsArray.forEach((chars, i) => {
    metas.push({
      value: chars,
      src_url: srcUrl,
      pinyins: [pinyinsArray[i]],
      zhuyins: [zhuyinsArray[i]]
    });
  });

  return metas;
}
