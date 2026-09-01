create table
  if not exists zi_meta (
    -- unicode 数值
    id_ integer not null primary key,
    --
    `value` text as (char(id_)) virtual,
    unicode text as (printf('U+%04X', id_)) virtual,
    --
    -- 是否为有效字：仅有效字将被用于生成应用数据
    valid integer default 0,
    -- 是否为繁体字
    traditional integer default 0,
    --
    -- 字形结构
    glyph_struct text default '',
    -- 笔画顺序：1 - 横/提，2 - 竖，3 - 撇，4 - 捺/点，5 - 折
    stroke_order text default '',
    -- 总笔画数
    total_stroke_count integer default 0,
    --
    -- 部首
    radical text default '',
    -- 部首笔画数
    radical_stroke_count integer default 0,
    --
    -- 字型是否存在：需在系统字体文件中有字型才能被看到
    glyph_exists integer default 0,
    -- 字形权重
    glyph_weight integer default 0,
    --
    -- 拼音列表：["<拼音>", ...]
    pinyins text default '[]',
    -- 拼音字使用权重：{"<拼音>": <权重值>, ...}
    pinyin_used_weights text default '{}',
    -- 注音列表：["<注音>", ...]
    zhuyins text default '[]',
    --
    -- 简体字列表：["<简体字>", ...]
    simples text default '[]',
    -- 异体字列表：["<异体字>", ...]
    variants text default '[]',
    -- 繁体字列表：["<繁体字>", ...]
    traditionals text default '[]'
  );