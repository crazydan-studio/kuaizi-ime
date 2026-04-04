create table
    if not exists meta_zi_stroke (
        id_ integer not null primary key,
        -- 字 Unicode
        zi_ text not null,
        -- 笔画序号
        index_ integer default 0,
        -- svg 路径
        path_ text not null,
        --
        unique (zi_, index_)
    );