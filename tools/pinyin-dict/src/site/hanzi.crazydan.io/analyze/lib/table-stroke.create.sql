create table
    if not exists meta_zi_stroke_path (
        id_ integer not null primary key,
        -- 笔画名，如：点、横、竖折折钩等
        name_ text not null default '',
        -- 笔画 svg 路径
        value_ text not null
    );

create table
    if not exists meta_zi_stroke (
        id_ integer not null primary key,
        -- 汉字的 code point（十进制）
        zi_ integer not null,
        -- 笔画序号
        index_ integer default 0,
        -- 笔画路径 id
        path_ integer not null
    );

create view
    if not exists zi_stroke (id_, zi_, index_, name_, path_) as
select
    s_.id_,
    s_.zi_,
    s_.index_,
    p_.name_,
    p_.value_
from
    meta_zi_stroke s_
    --
    left join meta_zi_stroke_path p_ on p_.id_ = s_.path_;