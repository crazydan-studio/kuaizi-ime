import * as path from 'path';

import { sleep } from '#utils/native.mjs';
import { existFile, fetchAndWriteFile } from '#utils/file.mjs';

/** 获取并保存与字相关的图片和音频 */
export async function fetchAndSaveWordMedias(wordMedias, targetDir) {
  console.log('- 保存拼音的音频文件');
  for (let pinyin in wordMedias.pinyins) {
    const url = wordMedias.pinyins[pinyin];
    const file = path.join(targetDir, 'pinyin', `${pinyin}.${getExt(url)}`);

    await saveUrl(url, file);
  }

  console.log('- 保存字的字形和笔顺图片');
  for (let { media, unicode } of wordMedias.words) {
    for (let name in media) {
      const url = media[name];
      const file = path.join(
        targetDir,
        `zi/${unicode}`,
        `${name.replace(/_url$/g, '').replace('_', '-')}.${getExt(url)}`
      );

      await saveUrl(url, file);
    }
  }
}

async function saveUrl(url, file, force) {
  if (force || !existFile(file)) {
    try {
      await fetchAndWriteFile(url, file);
    } catch (e) {
      console.log(`  - ${url} ${e.message}`);
    }

    sleep(100);
  }
}

function getExt(url) {
  return url.replace(/^.+\.([^.]+)$/g, '$1');
}
