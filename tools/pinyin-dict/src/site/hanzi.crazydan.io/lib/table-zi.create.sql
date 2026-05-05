-- 拼音
create table
  if not exists meta_pinyin (
    id_ integer not null primary key,
    -- 拼音的纯英文字母组合
    value_ text not null,
    -- 声调：0 - 零声（轻声），1 - 一声，2 - 二声，3 - 三声，4 - 四声
    tone_ integer not null
  );

-- 字及其拼音
create table
  if not exists meta_zi (
    id_ integer not null primary key,
    -- 字的 unicode 值（十进制）
    unicode_ integer not null,
    -- 拼音 id
    pinyin_ integer not null,
    -- 拼音字权重
    weight_ integer default 0
  );

-- 拼音字
create view
  if not exists pinyin_zi (id_, unicode_, pinyin_, pinyin_tone_, weight_) as
select
  zi_.id_,
  zi_.unicode_,
  pinyin_.value_,
  pinyin_.tone_,
  zi_.weight_
from
  meta_zi zi_
  inner join meta_pinyin pinyin_ on pinyin_.id_ = zi_.pinyin_;