create table
    if not exists meta_zi_stroke (
        id_ integer not null primary key,
        -- 笔画所属汉字的 Unicode
        zi_ text not null,
        -- 笔画序号
        index_ integer default 0,
        -- 笔画名，如：点、横、竖折折钩等
        name_ text not null default '',
        -- 笔画 svg 路径
        path_ text not null,
        -- 笔画书写的 svg 路径
        write_path_ text not null default '',
        --
        unique (zi_, index_)
    );