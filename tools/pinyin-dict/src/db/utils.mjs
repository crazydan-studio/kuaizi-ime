import { fromRootPath } from '#utils/utils.mjs';

/** 获取 SQLite 字典库文件路径 */
export function getZiDictSQLiteFile() {
  return fromRootPath('data', 'pinyin-zi-dict.sqlite');
}

export function getZiDictSQLiteVersionFile(version) {
  return fromRootPath('data', 'pinyin-zi-dict.' + version + '.sqlite');
}
