import * as path from 'path';

import { sleep } from '#utils/native.mjs';
import { existFile, fetchAndWriteFile } from '#utils/file.mjs';
import { symbolToNumberTonePinyin } from '#utils/spell.mjs';

/** 获取并保存与字相关的图片和音频 */
export async function fetchAndSaveZiMedias(ziMedias, targetDir) {
  console.log('- 保存拼音的音频文件');
  for (let pinyin in ziMedias.pinyins) {
    const url = ziMedias.pinyins[pinyin];
    const file = path.join(
      targetDir,
      'audio/pinyin',
      `${symbolToNumberTonePinyin(pinyin, true)}.${getExt(url)}`
    );

    await saveUrl(url, file);
  }
}

/**
 * 向字补充媒体信息并保存到文件
 *
 * @return ```json
 * {
 *    pinyins: {yi: 'https://xxx', ...},
 * }
 * ```
 */
export async function patchZiMedias(ziMetas) {
  const ziMedias = { pinyins: {} };

  ziMetas.forEach((meta) => {
    meta.pinyins.forEach(({ value }) => {
      if (!ziMedias.pinyins[value]) {
        ziMedias.pinyins[value] =
          `https://img.zdic.net/audio/zd/py/${value}.mp3`;
      }
    });
  });

  return ziMedias;
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
