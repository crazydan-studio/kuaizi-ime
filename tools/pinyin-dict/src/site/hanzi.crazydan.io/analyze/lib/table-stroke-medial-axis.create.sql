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
        -- 坐标点（原始数值扩大 N 倍后存储，避免存储 real 浪费不必要的存储空间，数值扩大倍数取决于线段坐标点的精度）
        x0_ integer default 0,
        y0_ integer default 0,
        x1_ integer default 0,
        y1_ integer default 0
    );

-- -----------------------------------------------------------
-- NOTE: 仅用作以 cli 方式查询，其性能较差，需在应用侧分组和拼装结果
create view
    if not exists zi_stroke_path_medial_axis_branch (id_, path_, value_) as
select
    b_.id_,
    b_.path_,
    '[' || group_concat (
        (
            '[' || round(s_.radius_ / 100.0, 2) || ',' || round(s_.x0_ / 100.0, 2) || ',' || round(s_.y0_ / 100.0, 2) || ',' || round(s_.x1_ / 100.0, 2) || ',' || round(s_.y1_ / 100.0, 2) || ']'
        ),
        ','
    ) || ']' as value_
from
    meta_zi_stroke_path_medial_axis_branch b_
    --
    inner join meta_zi_stroke_path_medial_axis_branch_segment s_ on s_.branch_ = b_.id_
group by
    s_.branch_
order by
    s_.id_ asc;