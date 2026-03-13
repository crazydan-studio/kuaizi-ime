create table
  if not exists meta_phrase (
    id_ integer not null primary key,
    -- 短语文本内容
    value_ text not null,
    -- 短语序号：针对排序后的多音词的词序号
    index_ integer not null,
    -- 按使用频率等排序的权重
    weight_ integer default 0,
    --
    unique (value_, index_)
  );

-- --------------------------------------------------------------
create table
  if not exists meta_phrase_with_pinyin_word (
    id_ integer not null primary key,
    -- 短语 id
    phrase_id_ integer not null,
    -- 字及其拼音关联表 meta_word_with_pinyin 的 id
    word_id_ integer not null,
    -- 字在短语中的序号
    word_index_ integer not null,
    --
    unique (phrase_id_, word_id_, word_index_),
    foreign key (phrase_id_) references meta_phrase (id_),
    foreign key (word_id_) references meta_word_with_pinyin (id_)
  );

create table
  if not exists meta_phrase_with_zhuyin_word (
    id_ integer not null primary key,
    -- 短语 id
    phrase_id_ integer not null,
    -- 字及其注音关联表 meta_word_with_zhuyin 的 id
    word_id_ integer not null,
    -- 字在短语中的序号
    word_index_ integer not null,
    --
    unique (phrase_id_, word_id_, word_index_),
    foreign key (phrase_id_) references meta_phrase (id_),
    foreign key (word_id_) references meta_word_with_zhuyin (id_)
  );

-- --------------------------------------------------------------
create view
  if not exists link_phrase_with_pinyin_word (
    id_,
    source_id_,
    target_id_,
    target_spell_chars_id_,
    target_index_
  ) as
select
  meta_.id_,
  meta_.phrase_id_,
  meta_.word_id_,
  spell_.chars_id_,
  meta_.word_index_
from
  meta_phrase_with_pinyin_word meta_
  --
  left join meta_word_with_pinyin word_ on word_.id_ = meta_.word_id_
  left join meta_pinyin spell_ on spell_.id_ = word_.spell_id_;

create view
  if not exists link_phrase_with_zhuyin_word (
    id_,
    source_id_,
    target_id_,
    target_spell_chars_id_,
    target_index_
  ) as
select
  meta_.id_,
  meta_.phrase_id_,
  meta_.word_id_,
  spell_.chars_id_,
  meta_.word_index_
from
  meta_phrase_with_zhuyin_word meta_
  --
  left join meta_word_with_zhuyin word_ on word_.id_ = meta_.word_id_
  left join meta_zhuyin spell_ on spell_.id_ = word_.spell_id_;

-- --------------------------------------------------------------
-- 短语及其拼音
create view
  if not exists pinyin_phrase (
    id_,
    value_,
    index_,
    weight_,
    word_,
    word_index_,
    word_spell_,
    word_spell_chars_,
    word_spell_chars_id_
  ) as
select
  phrase_.id_,
  phrase_.value_,
  phrase_.index_,
  phrase_.weight_,
  word_.value_,
  lnk_.word_index_,
  spell_.value_,
  spell_ch_.value_,
  spell_.chars_id_
from
  meta_phrase phrase_
  --
  left join meta_phrase_with_pinyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
  --
  left join meta_word_with_pinyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
  left join meta_word word_ on word_.id_ = word_lnk_.word_id_
  left join meta_pinyin spell_ on spell_.id_ = word_lnk_.spell_id_
  left join meta_pinyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
  -- Note: group by 不能对组内元素排序，故，只能在视图内先排序
order by
  phrase_.index_ asc,
  lnk_.word_index_ asc;

-- 短语及其注音
create view
  if not exists zhuyin_phrase (
    id_,
    value_,
    index_,
    weight_,
    word_,
    word_index_,
    word_spell_,
    word_spell_chars_,
    word_spell_chars_id_
  ) as
select
  phrase_.id_,
  phrase_.value_,
  phrase_.index_,
  phrase_.weight_,
  word_.value_,
  lnk_.word_index_,
  spell_.value_,
  spell_ch_.value_,
  spell_ch_.id_
from
  meta_phrase phrase_
  --
  left join meta_phrase_with_zhuyin_word lnk_ on lnk_.phrase_id_ = phrase_.id_
  --
  left join meta_word_with_zhuyin word_lnk_ on word_lnk_.id_ = lnk_.word_id_
  left join meta_word word_ on word_.id_ = word_lnk_.word_id_
  left join meta_zhuyin spell_ on spell_.id_ = word_lnk_.spell_id_
  left join meta_zhuyin_chars spell_ch_ on spell_ch_.id_ = spell_.chars_id_
  -- Note: group by 不能对组内元素排序，故，只能在视图内先排序
order by
  phrase_.index_ asc,
  lnk_.word_index_ asc;