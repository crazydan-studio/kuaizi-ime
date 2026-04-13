create table
    if not exists meta_zi_stroke_path_cluster (
        -- 笔画路径(meta_zi_stroke_path) id
        id_ integer not null primary key,
        -- 笔画聚类值
        value_ integer not null,
        -- 笔画聚类名
        name_ text not null default ''
    );

create table
    if not exists meta_zi_stroke_path_feature (
        -- 笔画路径(meta_zi_stroke_path) id
        id_ integer not null primary key,
        -- 笔画路径特征值
        value_ blob not null
    );