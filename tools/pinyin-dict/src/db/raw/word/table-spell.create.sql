-- 不含声调的拼音字母组合
create table
  if not exists meta_pinyin_chars (
    id_ integer not null primary key,
    value_ text not null,
    --
    unique (value_)
  );

-- 含声调的拼音：可根据 id_ 大小排序
create table
  if not exists meta_pinyin (
    id_ integer not null primary key,
    value_ text not null,
    -- 拼音字母组合 id
    chars_id_ integer not null,
    --
    unique (value_),
    foreign key (chars_id_) references meta_pinyin_chars (id_)
  );

-- --------------------------------------------------------------
-- 不含声调的注音字符组合
create table
  if not exists meta_zhuyin_chars (
    id_ integer not null primary key,
    value_ text not null,
    --
    unique (value_)
  );

-- 含声调的注音：可根据 id_ 大小排序
create table
  if not exists meta_zhuyin (
    id_ integer not null primary key,
    value_ text not null,
    -- 注音字符组合 id
    chars_id_ integer not null,
    --
    unique (value_),
    foreign key (chars_id_) references meta_zhuyin_chars (id_)
  );