import { JSDOM } from 'jsdom';

import { nativeHTMLNodeInnerText, trimHTMLText } from '#utils/html.mjs';
import { zeroPinyinTone, correctPinyin } from '#utils/spell.mjs';
import { getUnicodeStr, hasGlyphFontForCodePoint } from '#utils/zi.mjs';

// 从 zdic.net 获取字的详细数据
const baseUrl = 'https://zdic.net/hans/';

/** 同时获取多个字信息。Note: 部分字信息可能未提供读音 */
export async function fetchZiMetas(zies) {
  return await Promise.all(zies.map(fetchZiMeta));
}

/** 获取单个字信息。Note: 部分字信息可能未提供读音 */
export async function fetchZiMeta(zi) {
  const srcUrl = baseUrl + zi;
  const html = await (await fetch(srcUrl)).text();
  const $dom = new JSDOM(html);
  const $doc = (($dom || {}).window || {}).document;
  if (!$doc) {
    return { error: '无有效 HTML 文档' };
  }

  const title = $doc.title;
  if (!title.includes(zi)) {
    return { error: '获取 "' + zi + '" 的字信息存在异常: ' + title };
  }

  const unicode = getUnicodeStr(zi);
  // 汉字信息链接：https://zdic.net/hans/{字}
  // 汉字 svg 链接：https://img.zdic.net/kai/cn/{字 unicode 十六进制大写}.svg
  // 汉字 gif 链接：https://img.zdic.net/kai/jbh/{字 unicode 十六进制大写}.gif
  const ziMeta = {
    value: zi,
    unicode,
    glyph_struct: '',
    glyph_exists: hasGlyphFontForCodePoint(unicode),
    // 注音与拼音的区别和历史: https://sspai.com/post/75248
    // 拼音音频地址：https://img.zdic.net/audio/zd/py/${value}.mp3
    // 注音音频地址：https://img.zdic.net/audio/zd/zy/${value}.mp3
    pinyins: [],
    zhuyins: [],
    radical: '',
    stroke_order: '',
    total_stroke_count: 0,
    radical_stroke_count: 0,
    traditional: false,
    //
    simples: [],
    variants: [],
    traditionals: []
  };

  $doc
    .querySelectorAll(
      '.char-card .char-card__main .char-meta .meta-row .meta-badge'
    )
    .forEach(($el) => {
      const badge = nativeHTMLNodeInnerText($el);
      const value = nativeHTMLNodeInnerText($el.nextElementSibling);

      switch (badge) {
        case '部首':
          ziMeta.radical = value;
          break;
        case '部外':
          ziMeta.radical_stroke_count = parseInt(value);
          break;
        case '总笔画':
          ziMeta.total_stroke_count = parseInt(value);
          break;
        case '笔顺':
          ziMeta.stroke_order = value;
          break;
        case '字形结构':
          ziMeta.glyph_struct = value;
          break;
      }
    });

  // 简/繁字 + 异体字
  $doc
    .querySelectorAll('.char-card .char-card__variants .meta-badge')
    .forEach(($el) => {
      const badge = nativeHTMLNodeInnerText($el);
      const items = [];

      $el.nextElementSibling
        .querySelectorAll('.variant-item a.variant-link')
        .forEach(($e) => {
          const value = trimHTMLText($e.title);
          value && items.push(value);
        });

      switch (badge) {
        case '繁体':
          ziMeta.traditional = false;
          ziMeta.traditionals = items;
          break;
        case '简体':
          ziMeta.traditional = true;
          ziMeta.simples = items;
          break;
        case '异体':
          ziMeta.traditional = false;
          ziMeta.variants = items;
          break;
      }
    });

  const pyMap = {};
  const zyMap = {};
  // 从解释面板中获取汉字读音信息，确保每个读音都是有来源的
  $doc.querySelectorAll('.dict-section').forEach(($section) => {
    const title = trimHTMLText($section.getAttribute('data-section'));

    let code = '';
    switch (title) {
      case '基本解释':
        code = 'jbjs';
        break;
      case '详细解释':
        code = 'xxjs';
        break;
      case '國語辭典':
        code = 'gy';
        break;
    }

    if (!code) {
      return;
    }

    $section.querySelectorAll(`.${code}-reading`).forEach(($head) => {
      // Note: char 可能包含前缀
      const char = nativeHTMLNodeInnerText(
        $head.querySelector(`.${code}-reading__char`)
      );

      const py = nativeHTMLNodeInnerText(
        $head.querySelector(`.${code}-reading__py`)
      )
        .replace(/^.+\)/g, '')
        .toLowerCase();

      const zy = nativeHTMLNodeInnerText(
        $head.querySelector(`.${code}-reading__zy`)
      ).replace(/^.+\)/g, '');

      // Note：在汉字的拼音列表中可能混入注音
      if (
        char.endsWith(zi) &&
        !!py &&
        /^[0-9a-z ü]+$/.test(zeroPinyinTone(correctPinyin(py)))
      ) {
        pyMap[py] ||= true;

        zy && (zyMap[zy] ||= true);
      } else {
        py && console.log(`无效的汉典拼音：${zi} - ${py}`);
      }
    });
  });

  ziMeta.pinyins = Object.keys(pyMap);
  ziMeta.zhuyins = Object.keys(zyMap);

  return ziMeta;
}
