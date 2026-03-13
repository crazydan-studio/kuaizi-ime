create table
  if not exists meta_emoji_group (
    id_ integer not null primary key,
    value_ text not null,
    unique (value_)
  );

create table
  if not exists meta_emoji (
    id_ integer not null primary key,
    -- 表情符号
    value_ text not null,
    unicode_ text not null,
    unicode_version_ real not null,
    group_id_ interget not null,
    -- 表情关键字中的字 id（meta_word 中的 id）数组列表：二维 json 数组形式
    keyword_ids_list_ text not null,
    unique (value_),
    foreign key (group_id_) references meta_emoji_group (id_)
  );

-- 表情及其关键字
create view
  if not exists emoji (
    id_,
    value_,
    unicode_,
    unicode_version_,
    group_,
    keyword_
  ) as
select
  emo_.id_,
  emo_.value_,
  emo_.unicode_,
  emo_.unicode_version_,
  grp_.value_,
  (
    select
      group_concat (word_.value_, '')
    from
      json_each (emo_.keyword_ids_) word_id_
      inner join meta_word word_ on word_.id_ = word_id_.value
  )
from
  (
    select
      emo_.id_,
      emo_.value_,
      emo_.unicode_,
      emo_.unicode_version_,
      emo_.group_id_,
      json_each.value as keyword_ids_
    from
      meta_emoji emo_,
      json_each (emo_.keyword_ids_list_)
  ) emo_
  left join meta_emoji_group grp_ on grp_.id_ = emo_.group_id_
order by
  emo_.id_ asc;
