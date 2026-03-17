import { JSDOM } from 'jsdom';

import { naiveHTMLNodeInnerText, sleep } from '#utils/utils.mjs';
import { getWordCode } from '#utils/word.mjs';

// 从 bishun.net 获取字的笔画演示
// - 汉字皮：https://www.hanzipi.com/
// - Chinese Stroke Order Dictionary: https://www.strokeorder.com/
const baseUrl = 'https://bishun.net/hanzi/';
const alllistUrl = 'https://bishun.net/alllist/';

/**
 * 同时获取多个字的笔画演示图
 *
 *  @return `[{stroke_demo_url: 'https://xxx', stroke_order_url: 'https://xxx'}, ...]`
 */
export async function fetchWordStrokeImages(words) {
  return await Promise.all(words.map(fetchWordMeta));
}

/**
 * 获取单个字的笔画演示图
 *
 * @return `{stroke_demo_url: 'https://xxx', stroke_order_url: 'https://xxx'}`
 */
export async function fetchWordStrokeImage(word) {
  const srcUrl = baseUrl + getWordCode(word);
  const html = await (await fetch(srcUrl)).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return;
  }

  const image = {};
  const $images = $doc.querySelectorAll(
    '.bishun-article-container .bishun-bishun-image img'
  );
  $images.forEach(($el) => {
    const src = $el.getAttribute('src');
    const title = $el.getAttribute('title');

    if (title.includes('笔顺动画')) {
      image.stroke_demo_url = src;
    } else if (title.includes('笔顺规范')) {
      image.stroke_order_url = src;
    }
  });

  return image;
}

/**
 * 获取所有有笔顺的字
 *
 * @return `[{value: '字', code: '23383', media: {stroke_demo_url: 'https://xxx', stroke_order_url: 'https://xxx'}}, ...]`
 */
export async function fetchAllValidWords() {
  let allWords = [];

  let page = 1;
  while (true) {
    const words = await fetchPageValidWords(page++);
    if (words.length == 0) {
      break;
    }

    allWords = allWords.concat(words);

    sleep(100);
  }
  return allWords;
}

async function fetchPageValidWords(page) {
  const srcUrl = alllistUrl + (page == 1 ? 'index.html' : `index_${page}.html`);
  const html = await (await fetch(srcUrl)).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return;
  }

  const words = [];
  const $list = $doc.querySelectorAll('li a.hanzibishun');
  $list.forEach(($el) => {
    const value = naiveHTMLNodeInnerText($el).trim();
    const href = $el.getAttribute('href');
    const code = href.replace(/^.+\/([^\/]+)$/g, '$1');

    words.push({
      value,
      media: {
        stroke_demo_url: `https://bishun.net/assets/bishun/donghua/bishundonghua-${code}.gif`,
        stroke_order_url: `https://bishun.net/assets/bishun/fenbu/bishun-${code}.png`
      }
    });
  });

  return words;
}
