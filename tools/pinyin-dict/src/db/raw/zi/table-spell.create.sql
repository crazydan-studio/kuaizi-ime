-- 拼音
create table
  if not exists meta_pinyin (
    id_ integer not null primary key,
    -- 拼音的纯英文字母组合
    value_ text not null,
    -- 声调：0 - 零声（轻声），1 - 一声，2 - 二声，3 - 三声，4 - 四声
    tone_ integer not null,
    -- 拼音原始内容（含声调）
    raw_ text not null,
    --
    unique (value_, tone_)
  );