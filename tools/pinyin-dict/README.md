拼音字典数据采集和校正程序
=========================

## 项目初始化

```bash
yarn install
```

## 数据处理

- 从[汉典网](https://www.zdic.net)抓取原始字信息，
  并生成有效的字数据至 `data/pinyin-dict.valid.txt`：

```bash
npm run generate:raw
```

> - 完整的字数据放在 `data/pinyin-dict.raw.txt` 中，
>   仅当该文件不存在时，才重新从汉典网抓取全量字信息，
>   否则，仅更新 `data/pinyin-dict.valid.txt` 的数据；
> - 涉及按字形排序等的权重计算，故而生成时间会比较长；

- 从 [EmojiXD](https://emojixd.com/) 抓取表情符号，
  并将 json 数据存放在 `data/emotions.json` 中：

```bash
npm run generate:emotion
```

- 根据 `data/pinyin-dict.valid.txt` 和 `data/emotions.json`
  将字、词拼音、表情符号等数据写入 SQLite 数据库
  `data/pinyin-dict.all.sqlite`：

```bash
npm run generate:sqlite
```

- 根据 `data/pinyin-dict.all.sqlite`
  生成`筷字输入法`专用的 SQLite 数据库：

```bash
npm run generate:sqlite:ime
```

> - 以上 SQLite 数据库生成命令将自动对多余数据做删除，对新增数据做插入，
>   对有变化的数据做更新；
> - 若需要全新建库，则先删除 SQLite 数据库文件，再执行上述命令即可；

## 数据分析

打开 SQLite 数据库：

```bash
sqlite3 data/pinyin-dict.all.sqlite
```

### 按字查询

- 各类字体结构的代表字

```sql
select
  glyph_struct_,
  value_
from
  meta_word
group by
  glyph_struct_;
```

- 各类字体结构的前 50 个字

```sql
select
  glyph_struct_,
  -- substr 的截断长度需包含分隔符
  substr(group_concat(distinct value_), 0, 99)
from
  meta_word
group by
  glyph_struct_;
```

- 各类字体结构的部首分布

```sql
select
  glyph_struct_,
  value_,
  group_concat(distinct radical_)
from
  meta_word
group by
  glyph_struct_;
```

- 各类字体结构包含的字数

```sql
select
  glyph_struct_,
  count(distinct value_) as amount
from
  meta_word
group by
  glyph_struct_
order by
  amount desc;
```

- 各部首包含的字数

```sql
select
  radical_,
  count(distinct value_) as amount
from
  meta_word
group by
  radical_
order by
  amount desc;
```

- 根据字形权重排序

```sql
select
  radical_,
  group_concat(distinct value_)
from
  meta_word
group by
  radical_
order by
  radical_stroke_count_ asc,
  weight_ desc;
```

- 统计所有字包含的笔画

```sql
with recursive
  split_stroke (stroke, pos, stroke_name) as (
    select distinct
      stroke_order_,
      1,
      ''
    from
      meta_word
    union all
    select
      stroke,
      pos + 1,
      substr (stroke, pos, 1)
    from
      split_stroke
    where
      length (stroke) >= pos
  )
select distinct
  stroke_name
from
  split_stroke
where
  stroke_name != ''
order by
  stroke_name;
```

> - `1` 代表 `横`，`2` 代表 `竖`，`3` 代表 `撇`，`4` 代表 `捺`，`5` 代表 `折`

### 按拼音查询

- 各拼音包含的字数

> 若要查询注音字，则将表 `pinyin_word` 更改为 `zhuyin_word` 即可。

```sql
select
  spell_chars_,
  count(distinct word_) as amount
from
  pinyin_word
group by
  spell_chars_
order by
  amount desc;
```

- 根据拼音权重排序

```sql
select
  spell_chars_,
  group_concat(distinct word_)
from
  (
    select
      *
    from
      pinyin_word
    order by
      spell_weight_ desc
  )
group by
  spell_chars_
order by
  spell_chars_ asc;
```

- 某字（拼音）完整信息

> 若要查询注音字，则将表 `pinyin_word` 更改为 `zhuyin_word` 即可。

```sql
select
  id_,
  word_,
  unicode_,
  group_concat(distinct spell_),
  group_concat(distinct spell_chars_),
  glyph_struct_,
  radical_,
  stroke_order_,
  total_stroke_count_,
  radical_stroke_count_,
  traditional_,
  group_concat(distinct simple_word_),
  group_concat(distinct traditional_word_),
  group_concat(distinct variant_word_)
from
  pinyin_word
where
  word_ = '国'
group by
  id_;
```

- 拼音的字母组成

```sql
select
  substr (value_, 1, 1) as start_,
  group_concat (distinct value_)
from
  (
    select
      *
    from
      meta_pinyin_chars
    order by
      value_ asc
  )
group by
  start_
order by
  start_ asc;
```

### 按词组查询

- 词组（拼音）组成信息

> 若要查询注音词组，则将表 `pinyin_phrase` 更改为 `zhuyin_phrase` 即可。

```sql
select
  id_,
  value_,
  weight_,
  index_,
  group_concat(word_ || '(' || word_spell_ || ')', '')
from
  pinyin_phrase
group by
  id_,
  index_;
```

- 按权重排序词组

```sql
select
  id_,
  value_,
  weight_,
  index_,
  group_concat(word_ || '(' || word_spell_ || ')', '')
from
  pinyin_phrase
group by
  id_,
  index_
order by
  weight_ asc;
```

### 按表情查询

- 表情及其关键字信息

```sql
select
  id_,
  value_,
  keyword_index_,
  group_concat(keyword_word_, '')
from
  emotion
group by
  id_,
  keyword_index_;
```

## License

[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
