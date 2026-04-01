-- 字部首
create table
  if not exists meta_zi_radical (
    id_ integer not null primary key,
    value_ text not null,
    -- 笔画数
    stroke_count_ integer default 0,
    --
    unique (value_)
  );

-- 单字
create table
  if not exists meta_zi (
    id_ integer not null primary key,
    value_ text not null,
    unicode_ text not null,
    -- 部首 id
    radical_id_ integer default null,
    -- 字形结构
    glyph_struct_ text default '',
    -- 笔画顺序：1 - 横/提，2 - 竖，3 - 撇，4 - 捺/点，5 - 折
    stroke_order_ text default '',
    -- 总笔画数
    total_stroke_count_ integer default 0,
    -- 是否为繁体字
    traditional_ integer default 0,
    -- 字形权重
    glyph_weight_ integer default 0,
    --
    unique (value_),
    foreign key (radical_id_) references meta_zi_radical (id_)
  );

-- --------------------------------------------------------------
create table
  if not exists meta_zi_with_pinyin (
    id_ integer not null primary key,
    -- 字 id
    zi_id_ integer not null,
    -- 拼音 id
    spell_id_ integer not null,
    -- 拼音字权重
    used_weight_ integer default 0,
    --
    unique (zi_id_, spell_id_),
    foreign key (zi_id_) references meta_zi (id_),
    foreign key (spell_id_) references meta_pinyin (id_)
  );

-- --------------------------------------------------------------
create table
  if not exists meta_zi_simple (
    -- 源字 id
    source_id_ integer not null,
    -- 简体字 id
    target_id_ integer not null,
    --
    primary key (source_id_, target_id_)
  );

create table
  if not exists meta_zi_traditional (
    -- 源字 id
    source_id_ integer not null,
    -- 繁体字 id
    target_id_ integer not null,
    --
    primary key (source_id_, target_id_)
  );

-- --------------------------------------------------------------
-- 字及其拼音
create view
  if not exists pinyin_zi (
    id_,
    zi_,
    zi_id_,
    unicode_,
    spell_id_,
    spell_value_,
    spell_tone_,
    spell_raw_,
    used_weight_,
    glyph_weight_,
    glyph_struct_,
    radical_,
    radical_stroke_count_,
    stroke_order_,
    total_stroke_count_,
    traditional_,
    simple_zi_,
    traditional_zi_
  ) as
select
  zi_lnk_.id_,
  zi_.value_,
  zi_.id_,
  zi_.unicode_,
  spell_.id_,
  spell_.value_,
  spell_.tone_,
  spell_.raw_,
  zi_lnk_.used_weight_,
  zi_.glyph_weight_,
  zi_.glyph_struct_,
  radical_.value_,
  radical_.stroke_count_,
  zi_.stroke_order_,
  zi_.total_stroke_count_,
  zi_.traditional_,
  sc_.value_,
  tc_.value_
from
  meta_zi zi_
  --
  left join meta_zi_with_pinyin zi_lnk_ on zi_lnk_.zi_id_ = zi_.id_
  --
  left join meta_zi_radical radical_ on radical_.id_ = zi_.radical_id_
  left join meta_pinyin spell_ on spell_.id_ = zi_lnk_.spell_id_
  --
  left join meta_zi_simple sc_lnk_ on sc_lnk_.source_id_ = zi_.id_
  left join meta_zi sc_ on sc_.id_ = sc_lnk_.target_id_
  left join meta_zi_traditional tc_lnk_ on tc_lnk_.source_id_ = zi_.id_
  left join meta_zi tc_ on tc_.id_ = tc_lnk_.target_id_;

-- --------------------------------------------------------------
-- 繁体 -> 简体
create view
  if not exists simple_zi (
    -- 繁体字 id
    source_id_,
    -- 繁体字
    source_value_,
    -- 简体字 id
    target_id_,
    -- 简体字
    target_value_
  ) as
select
  source_.id_,
  source_.value_,
  target_.id_,
  target_.value_
from
  meta_zi_simple lnk_
  inner join meta_zi source_ on source_.id_ = lnk_.source_id_
  inner join meta_zi target_ on target_.id_ = lnk_.target_id_;

-- 简体 -> 繁体
create view
  if not exists traditional_zi (
    -- 简体字 id
    source_id_,
    -- 简体字
    source_value_,
    -- 繁体字 id
    target_id_,
    -- 繁体字
    target_value_
  ) as
select
  source_.id_,
  source_.value_,
  target_.id_,
  target_.value_
from
  meta_zi_traditional lnk_
  inner join meta_zi source_ on source_.id_ = lnk_.source_id_
  inner join meta_zi target_ on target_.id_ = lnk_.target_id_;