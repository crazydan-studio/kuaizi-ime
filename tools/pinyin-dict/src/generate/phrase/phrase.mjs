import got from 'got';
import { JSDOM } from 'jsdom';

import {
  sleep,
  appendLineToFile,
  correctPinyin,
  extractPinyinChars
} from '#utils/utils.mjs';

// 根据 www.cngwzj.com 拉取带拼音的语文课文
const kewenBaseUrl =
  'https://do.cngwzj.com/search/?zz=&keys=%D3%EF%CE%C4%BF%CE%CE%C4&px=&acc=&newpage=';
const gushiBaseUrl = 'https://www.cngwzj.com/tangshi300/78.html';
const guciBaseUrl = 'https://www.cngwzj.com/tangshi300/2137.html';
const gotOptions = { timeout: { connect: 50000 } };

/** 拉取所有的课文数据 */
export async function fetchAndSaveAllKeWen(file, dump) {
  const urls = await fetchKeWenUrls();

  console.log(`  - 总计 ${urls.length} 篇课文`);
  await fetchAndSaveArticles(file, urls, dump);
}

/** 拉取所有的古诗数据 */
export async function fetchAndSaveAllGushi(file, dump) {
  const urls = await fetchGushiciUrls(gushiBaseUrl);

  console.log(`  - 总计 ${urls.length} 篇古诗`);
  await fetchAndSaveArticles(file, urls, dump);
}

/** 拉取所有的古词数据 */
export async function fetchAndSaveAllGuci(file, dump) {
  const urls = await fetchGushiciUrls(guciBaseUrl);

  console.log(`  - 总计 ${urls.length} 篇古词`);
  await fetchAndSaveArticles(file, urls, dump);
}

/** 拉取课文 URL 地址 */
async function fetchKeWenUrls(page = 1) {
  return fetchAndParsePage(kewenBaseUrl + page, [], async ($doc) => {
    const $pageLinks = $doc.querySelectorAll('.pages a');
    const lastPageNumStr = $pageLinks[$pageLinks.length - 1]
      .getAttribute('href')
      .replaceAll(/.*newpage=/g, '');
    const lastPageNum = parseInt(lastPageNumStr);

    const tjItemLinks = parseArticleLinks($doc);

    if (page >= lastPageNum) {
      return tjItemLinks;
    }
    return tjItemLinks.concat(await fetchKeWenUrls(page + 1));
  });
}

/** 拉取古诗/词 URL 地址 */
async function fetchGushiciUrls(baseUrl) {
  return fetchAndParsePage(baseUrl, [], parseArticleLinks);
}

/** 拉取带拼音的文章全文 */
async function fetchArticle(url) {
  return fetchAndParsePage(url, {}, ($doc) => {
    const $titles = $doc.querySelectorAll('#gsbox .g_box .text-c li');
    const $title = $titles[0];
    const $subtitle = $titles[1];
    // Note: 段落顺序在服务端被打乱了，暂时不清楚其还原逻辑
    const $pargraphs = $doc.querySelectorAll('#gsbox .g_box #showgushi li');

    const title = parsePargraph($title);
    const subtitle = parsePargraph($subtitle);
    const pargraphs = [];
    $pargraphs.forEach(($el) => {
      const pargraph = parsePargraph($el);
      pargraphs.push(pargraph);
    });

    console.log(
      '  - 已拉取到文章：《' + title.map((w) => w.zi).join('') + '》'
    );

    return { title, subtitle, pargraphs };
  });
}

/** 拉取并保存文章 */
async function fetchAndSaveArticles(file, urls, dump) {
  const batchSize = 10;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batchUrls = urls.slice(i, i + batchSize);
    const list = await Promise.all(batchUrls.map(fetchArticle)).then(
      (values) => values
    );

    if (dump) {
      list.forEach(dumpArticle);
    }

    // Note: 首行写入前，先清空文件
    appendLineToFile(file, JSON.stringify(list), i === 0);

    await sleep(1000);
  }
}

async function fetchAndParsePage(url, defaultVal, parse) {
  const html = await got(url, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;

  if (!$doc) {
    return defaultVal;
  }

  return await parse($doc);
}

function parseArticleLinks($doc) {
  const $links = $doc.querySelectorAll('.tj_listbox .tj_title a');
  const links = [];

  $links.forEach(($el) => {
    const href = $el.getAttribute('href');
    links.push(href);
  });

  return links;
}

/** @return [{zi: '语', py: 'yǔ'}, {...}, ...] */
function parsePargraph($el) {
  // <span>　<br>，</span><span>cūn<br>村</span><span>gè<br><strong>个</strong></span>
  const $spans = $el.querySelectorAll('span');

  const pargraph = [];
  $spans.forEach(($span) => {
    const splits = $span.innerHTML.split('<br>');
    const py = cleanPinyin(splits[0]);
    const zi = cleanZi(splits[1]);

    if (zi) {
      pargraph.push(py ? { zi, py } : { zi });
    }
  });

  return pargraph;
}

function dumpArticle(article) {
  const dump = (words) => {
    console.error(words.map((w) => (w.py ? w.py : '  ')).join(' '));
    console.error(words.map((w) => w.zi).join(''));
  };

  console.error('=============================');
  dump(article.title);
  dump(article.subtitle);
  article.pargraphs.forEach(dump);
  console.error('=============================');
}

function cleanPinyin(py) {
  py = py.replaceAll('&nbsp;', '').trim();
  py = correctPinyin(py);

  if (py == 'g') {
    py = 'ǹg';
  }

  if (py && !/^[a-zü]+$/g.test(extractPinyinChars(py))) {
    console.error('  无效拼音：' + py);
    return '';
  }
  return py;
}

function cleanZi(zi) {
  return zi
    .replaceAll('&nbsp;', '')
    .replaceAll('<strong>', '')
    .replaceAll('</strong>', '')
    .trim();
}
