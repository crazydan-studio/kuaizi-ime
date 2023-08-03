import got from 'got';
import { JSDOM } from 'jsdom';

import { sleep } from '../../utils/utils.mjs';

const baseUrl = 'https://emojixd.com';
const gotOptions = { timeout: { connect: 50000 } };

export async function fetchEmotions() {
  const html = await got(baseUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return [];
  }

  const $groupLinks = $doc.querySelectorAll('.emoji-item > a');
  const groups = [];
  $groupLinks.forEach(($el) => {
    const url = baseUrl + $el.getAttribute('href');
    const zhName = $el.querySelector('.h3').textContent.trim();
    const enName = $el.querySelector('.h5').textContent.trim();

    groups.push({
      url,
      name: { zh: zhName, en: enName },
      emotions: []
    });
  });

  for (const group of groups) {
    const emotions = await fetchGroupEmotions(group.name.zh, group.url);
    group.emotions = emotions;
  }

  return groups;
}

async function fetchGroupEmotions(groupName, groupUrl) {
  const html = await got(groupUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return [];
  }

  const $emotionLinks = $doc.querySelectorAll('a.emoji-item');
  const emotionUrls = [];
  $emotionLinks.forEach(($el) => {
    const url = baseUrl + $el.getAttribute('href');

    emotionUrls.push(url);
  });

  const batchSize = 50;
  const emotions = [];
  for (let i = 0; i < emotionUrls.length; i += batchSize) {
    const urls = emotionUrls.slice(i, i + batchSize);
    const data = await Promise.all(urls.map(fetchEmotion));

    console.log(
      `已抓取到 ${groupName} 第 ${i + 1} 到 ${i + 1 + batchSize} 之间的数据.`
    );

    data.forEach((e) => {
      emotions.push(e);
    });

    await sleep(1500);
  }

  return emotions;
}

async function fetchEmotion(emotionUrl) {
  const html = await got(emotionUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return { url: emotionUrl };
  }

  const emotion = {
    value: '',
    name: { zh: '', en: '' },
    unicode: '',
    url: emotionUrl,
    keywords: []
  };

  const $value = $doc.querySelector('.center .emoji');
  emotion.value = $value.textContent.trim();

  $doc.querySelectorAll('dl > dt').forEach(($el) => {
    const title = $el.textContent.trim();
    const $next = $el.nextSibling;
    const value = $next.textContent.trim();

    switch (title) {
      case 'Emoji名称':
        emotion.name.zh = value;
        if (value.includes('旗:')) {
          emotion.keywords.push(value.replaceAll(/^旗:\s*/g, ''));
        }
        break;
      case '英文名称':
        emotion.name.en = value;
        break;
      case 'unicode编码':
        emotion.unicode = value;
        break;
      case '关键词':
        $next.querySelectorAll('a').forEach(($a) => {
          emotion.keywords.push($a.textContent.trim());
        });
        break;
    }
  });

  return emotion;
}
