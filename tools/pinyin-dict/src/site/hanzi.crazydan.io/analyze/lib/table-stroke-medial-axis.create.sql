create table
    if not exists meta_zi_stroke_path_medial_axis_branch (
        -- id 必须按中轴线分支的顺序递增，确保能够通过 id 确定中轴线分支的先后顺序
        id_ integer not null primary key,
        -- 所属笔画路径(meta_zi_stroke_path)的 id
        path_ integer not null
    );

create table
    if not exists meta_zi_stroke_path_medial_axis_branch_segment (
        -- id 必须按坐标点的顺序递增，确保能够通过 id 确定线段坐标点的先后顺序
        id_ integer not null primary key,
        -- 中轴线分支(meta_zi_stroke_path_medial_axis_branch) id
        branch_ integer not null,
        -- 线段的内切圆半径（原始数值扩大 N 倍后存储，避免存储 real 浪费不必要的存储空间，数值扩大倍数取决于线段坐标点的精度）
        radius_ integer not null,
        -- 线段类型：0 - 未知，1 - 直线，2 - 二次贝赛尔曲线，3 - 三次贝塞尔曲线
        type_ tinyint default 0,
        -- 坐标点（原始数值扩大 N 倍后存储，避免存储 real 浪费不必要的存储空间，数值扩大倍数取决于线段坐标点的精度）
        x0_ integer default 0,
        y0_ integer default 0,
        x1_ integer default 0,
        y1_ integer default 0,
        x2_ integer default 0,
        y2_ integer default 0,
        x3_ integer default 0,
        y3_ integer default 0
    );