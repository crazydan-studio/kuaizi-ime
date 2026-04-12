create table
    if not exists meta_zi_stroke_path_medial_axis_branch (
        id_ integer not null primary key,
        -- 所属笔画路径的 id
        path_ integer not null,
        -- 中轴线分支序号
        index_ integer default 0,
        -- 中轴线分支，其由多个线段组成，而线段则内切圆半径和起止点组成。
        -- 其值为 JSON 数组形式：[[radius, x1, y1, x2, y2], ...]
        value_ text not null
    );