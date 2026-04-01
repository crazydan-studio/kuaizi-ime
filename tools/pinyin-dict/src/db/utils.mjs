import { fromRootPath } from '#utils/file.mjs';

/** 获取 SQLite 字典库文件路径 */
export function getZiDictSQLiteFile() {
  return fromRootPath('data', 'pinyin-dict.sqlite');
}

export function getZiDictSQLiteVersionFile(version) {
  return fromRootPath('data', 'pinyin-dict.' + version + '.sqlite');
}
