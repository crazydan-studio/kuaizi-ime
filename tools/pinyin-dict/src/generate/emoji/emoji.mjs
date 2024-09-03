import got from 'got';
import { JSDOM } from 'jsdom';

import { sleep } from '#utils/utils.mjs';

const baseUrl = 'https://emojixd.com';
const gotOptions = { timeout: { connect: 50000 } };

export async function fetchEmojis() {
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
      emojis: []
    });
  });

  for (const group of groups) {
    const emojis = await fetchGroupEmojis(group.name.zh, group.url);
    group.emojis = emojis;
  }

  return groups;
}

async function fetchGroupEmojis(groupName, groupUrl) {
  const html = await got(groupUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return [];
  }

  const $emojiLinks = $doc.querySelectorAll('a.emoji-item');
  const emojiUrls = [];
  $emojiLinks.forEach(($el) => {
    const url = baseUrl + $el.getAttribute('href');

    emojiUrls.push(url);
  });

  const batchSize = 50;
  const emojis = [];
  for (let i = 0; i < emojiUrls.length; i += batchSize) {
    const urls = emojiUrls.slice(i, i + batchSize);
    const data = await Promise.all(urls.map(fetchEmoji));

    console.log(
      `已抓取到 ${groupName} 第 ${i + 1} 到 ${i + 1 + batchSize} 之间的数据.`
    );

    data.forEach((e) => {
      emojis.push(e);
    });

    await sleep(1500);
  }

  return emojis;
}

async function fetchEmoji(emojiUrl) {
  const html = await got(emojiUrl, gotOptions).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return { url: emojiUrl };
  }

  const emoji = {
    value: '',
    name: { zh: '', en: '' },
    unicode: '',
    unicode_version: '',
    url: emojiUrl,
    keywords: []
  };

  const $value = $doc.querySelector('.center .emoji');
  emoji.value = $value.textContent.trim();

  $doc.querySelectorAll('dl > dt').forEach(($el) => {
    const title = $el.textContent.trim();
    const $next = $el.nextSibling;
    const value = $next.textContent.trim();

    switch (title) {
      case 'Emoji名称':
        emoji.name.zh = value;
        if (value.includes('旗:')) {
          emoji.keywords.push(value.replaceAll(/^旗:\s*/g, ''));
        }
        break;
      case '英文名称':
        emoji.name.en = value;
        break;
      case 'unicode编码':
        emoji.unicode = value;
        break;
      case 'unicode版本':
        emoji.unicode_version = value;
        break;
      case '关键词':
        $next.querySelectorAll('a').forEach(($a) => {
          emoji.keywords.push($a.textContent.trim());
        });
        break;
    }
  });

  return emoji;
}
