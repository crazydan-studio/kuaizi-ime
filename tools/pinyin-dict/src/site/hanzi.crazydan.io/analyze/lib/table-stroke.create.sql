create table
    if not exists meta_zi_stroke_path (
        id_ integer not null primary key,
        -- 笔画名，如：点、横、竖折折钩等
        name_ text not null default ''
    );

create table
    if not exists meta_zi_stroke_path_point (
        -- id 必须按坐标点的顺序递增，确保能够通过 id 确定路径坐标点的先后顺序
        id_ integer not null primary key,
        -- 笔画路径(meta_zi_stroke_path) id
        path_ integer not null,
        -- 路径点类型：0 - 未知，1 - M，2 - C
        type_ tinyint default 0,
        -- 坐标点（原始数值扩大 N 倍后存储，避免存储 real 浪费不必要的存储空间，数值扩大倍数取决于路径坐标点的精度）
        x0_ integer default 0,
        y0_ integer default 0,
        x1_ integer default 0,
        y1_ integer default 0,
        x2_ integer default 0,
        y2_ integer default 0
    );

create table
    if not exists meta_zi_stroke (
        -- id 必须按笔画顺序递增，确保能够通过 id 确定笔画的先后顺序
        id_ integer not null primary key,
        -- 汉字的 code point 值（十进制）
        zi_ integer not null,
        -- 笔画路径(meta_zi_stroke_path) id
        path_ integer not null
    );

-- -----------------------------------------------------------
-- NOTE: 仅用作以 cli 方式查询，其性能较差，需在应用侧分组和拼装 svg 路径
create view
    if not exists zi_stroke_path (id_, name_, value_) as
select
    p_.id_,
    p_.name_,
    group_concat (
        (
            case
                when type_ = 1 then (
                    'M' || ' ' || round(x0_ / 100.0, 2) || ' ' || round(y0_ / 100.0, 2)
                )
                when type_ = 2 then (
                    'C' || ' ' || round(x0_ / 100.0, 2) || ' ' || round(y0_ / 100.0, 2) || ' ' || round(x1_ / 100.0, 2) || ' ' || round(y1_ / 100.0, 2) || ' ' || round(x2_ / 100.0, 2) || ' ' || round(y2_ / 100.0, 2)
                )
                else 'UNKNOWN'
            end
        ),
        ' '
    ) || ' Z' as value_
from
    meta_zi_stroke_path p_
    --
    inner join meta_zi_stroke_path_point pp_ on pp_.path_ = p_.id_
group by
    pp_.path_
order by
    pp_.id_ asc;