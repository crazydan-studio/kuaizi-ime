/* 供输入法使用的 SQLite 数据库 */
import { fromRootPath } from '../../../utils/utils.mjs';

// 适用于 IME 输入法的拼音字典 SQLite 数据库
const dictImeSQLiteFile = fromRootPath(
  '../..',
  'android/app/src/main/res/raw/pinyin_dict.db'
);
