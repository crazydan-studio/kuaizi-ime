import { fromRootPath } from '#utils/utils.mjs';

/** 获取 SQLite 字典库文件路径 */
export function getWordDictSQLiteFile() {
  return fromRootPath('data', 'pinyin-word-dict.sqlite');
}

export function getWordDictSQLiteVersionFile(version) {
  return fromRootPath('data', 'pinyin-word-dict.' + version + '.sqlite');
}
