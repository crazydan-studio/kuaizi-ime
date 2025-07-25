拼音字典数据采集和校正程序
=========================

## 快速开始

- 拉取外部仓库代码

```bash
# Note: 在当前 git 仓库的根目录中执行
git submodule \
  update --init \
  android \
  thirdparty/OpenCC \
  thirdparty/pinyin-data
```

- 构建字/词典库

```bash
# 安装依赖
npm install

# 解压原始数据
unzip data/pinyin-dict-data-word.zip -d data
unzip data/pinyin-dict-data-phrase.zip -d data
unzip data/pinyin-dict-db.zip -d data

# 更新/生成全量字典库
npm run generate:sqlite:word

# 构建 HMM 词典库
npm run generate:sqlite:phrase:hmm:trans_kewen \
  -- -f data/pinyin-dict-kewen.raw.txt \
&& npm run generate:sqlite:phrase:hmm
```

- 功能本地验证

```bash
npm run app:shell
```

- 为客户端生成专用的字/词典库

```bash
npm run generate:sqlite:ime
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

> 注：解压 `data/pinyin-dict-data-word.zip` 也可以得到已经就绪的上述文件。

- 从 [EmojiXD](https://emojixd.com/) 抓取表情符号，
  并将 json 数据存放在 `data/emotions.json` 中：

```bash
npm run generate:emotion
```

- 根据 `data/pinyin-dict.valid.txt` 和 `data/emotions.json`
  将字、词拼音、表情符号等数据写入 SQLite 数据库
  `data/pinyin-word-dict.sqlite`：

```bash
npm run generate:sqlite:word
```

> 全新生成的 `pinyin-word-dict.sqlite` 中的汉字 id 会随机发生变化，
> 因此，建议在首次生成后，便不要删除该字典库（若要更新，则直接在已有库上累积即可），
> 否则，会导致输入法中已记录的用户词库与该字典库中的字无法准确对应，造成输入的混乱。

## 词组预测

### HMM

- 从[古文之家](https://www.cngwzj.com)抓取带拼音的古诗词和小学课文

```bash
npm run generate:phrase
```

> 拉取到的课文分别保存在文件
> `data/pinyin-dict-guci.raw.txt`（宋词三百首）、
> `data/pinyin-dict-gushi.raw.txt`（唐诗三百首）、
> `data/pinyin-dict-kewen.raw.txt`（小学课文）中，每一行都为
> JSON 数组，数组元素为课文内容及其字的拼音。

> 注：解压 `data/pinyin-dict-data-phrase.zip` 也可以得到已经就绪的上述文件。

> 注：为表示感谢，本团队已以购买打印服务方式资助该网站
> <img src="./docs/img/donate-cngwzj.png" height="30"/>。

- 生成 HMM 训练数据

```bash
npm run generate:sqlite:phrase:hmm:trans_kewen \
  -- -f data/pinyin-dict-kewen.raw.txt \
  -f data/pinyin-dict-gushi.raw.txt \
  -f data/pinyin-dict-guci.raw.txt
```

> `-f` 指定用于训练的带拼音数据的文件或目录位置，在目录内可分为多个文件和子目录。
> 训练完成后的数据将放在 `data/hmm_params/kewen/trans_prob.json` 中。

- 创建词典库

```bash
npm run generate:sqlite:phrase:hmm
```

> 生成的 SQLite 词典库放在 `data/pinyin-phrase-dict.sqlite` 中

## 输入法

### 词组输入功能验证

```bash
npm run app:shell
```

### 生成 Android 字/词典库

- 根据 `data/pinyin-word-dict.sqlite`
  和 `data/pinyin-phrase-dict.sqlite`
  向 Android 客户端生成`筷字输入法`专用的 SQLite 字典和词典库：

```bash
npm run generate:sqlite:ime
```

> - 以上字典库生成命令将自动对多余数据做删除，对新增数据做插入，
>   对有变化的数据做更新；
> - 若需要全新建库，则先删除字典库文件，再执行上述命令即可；

## 数据分析

打开 SQLite 数据库：

```bash
sqlite3 data/pinyin-word-dict.sqlite
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
  word_,
  group_concat(distinct radical_)
from
  pinyin_word
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

- 各部首包含的字

```sql
select
  radical_,
  group_concat(distinct word_)
from
  pinyin_word
group by
  radical_
order by
  radical_stroke_count_ asc,
  used_weight_ desc;
```

- 各部首包含的字数

```sql
select
  radical_,
  count(distinct word_) as amount
from
  pinyin_word
group by
  radical_
order by
  amount desc;
```

- 根据笔画数排序的字

```sql
select
  value_,
  total_stroke_count_
from
  meta_word
order by
  total_stroke_count_ desc;
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

- 查询某拼音的候选字

```sql
select distinct
  id_, word_, word_id_, unicode_,
  spell_, spell_id_,
  spell_chars_, spell_chars_id_,
  glyph_struct_, traditional_,
  radical_, radical_stroke_count_,
  stroke_order_, total_stroke_count_,
  used_weight_, spell_weight_, glyph_weight_
from
  pinyin_word where spell_chars_ = 'wo'
order by
  traditional_ asc,
  spell_weight_ desc, spell_id_ asc,
  radical_ asc, radical_stroke_count_ asc,
  glyph_weight_ desc;
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

- 声母后的韵母组成的拼音数

```sql
select
  start_,
  sum(total_),
  group_concat (follow_ || ':' || total_)
from
  (
    select
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 1, 2)
        else substr(value_, 1, 1)
      end) as start_,
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 3, 1)
        else substr(value_, 2, 1)
      end) as follow_,
      count(value_) as total_
    from
      meta_pinyin_chars
    group by
      start_,
      follow_
    order by
      start_ asc,
      follow_ asc
  )
group by
  start_
order by
  start_ asc;
```

以上输出结果为：

```
j|14|i:10,u:4
q|14|i:10,u:4
x|14|i:10,u:4

o|2|:1,u:1
a|5|:1,i:1,n:2,o:1
e|5|:1,i:1,n:2,r:1

f|10|a:3,e:3,i:1,o:2,u:1
r|15|a:3,e:3,i:1,o:2,u:6
y|15|a:4,e:1,i:3,o:3,u:4
b|16|a:5,e:3,i:6,o:1,u:1
c|16|a:5,e:3,i:1,o:2,u:5
s|16|a:5,e:3,i:1,o:2,u:5
p|17|a:5,e:3,i:6,o:2,u:1
z|17|a:5,e:4,i:1,o:2,u:5
t|19|a:5,e:2,i:5,o:2,u:5
ch|19|a:5,e:3,i:1,o:2,u:8
sh|19|a:5,e:4,i:1,o:1,u:8
zh|20|a:5,e:4,i:1,o:2,u:8
m|20|:1,a:5,e:4,i:7,o:2,u:1
d|23|a:5,e:4,i:7,o:2,u:5

l|26|a:5,e:3,i:9,o:3,u:4,ü:2
n|27|:1,a:5,e:4,g:1,i:8,o:2,u:4,ü:2

w|9|a:4,e:3,o:1,u:1
g|19|a:5,e:4,o:2,u:8
k|19|a:5,e:4,o:2,u:8
h|21|a:5,e:4,m:1,n:1,o:2,u:8
```

- 各声母组成的拼音数

```sql
select
  start_,
  count(value_) as total_,
  group_concat (distinct value_)
from
  (
    select
      value_,
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 1, 2)
        else substr(value_, 1, 1)
      end) as start_,
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 3, 1)
        else substr(value_, 2, 1)
      end) as follow_
    from
      meta_pinyin_chars
    order by
      follow_ asc,
      length (value_) asc
  )
group by
  start_
order by
  total_ desc,
  start_ asc;
```

以上输出结果为：

```
zh|20|zha,zhai,zhan,zhao,zhang,zhe,zhei,zhen,zheng,zhi,zhou,zhong,zhu,zhua,zhui,zhun,zhuo,zhuai,zhuan,zhuang
ch|19|cha,chai,chan,chao,chang,che,chen,cheng,chi,chou,chong,chu,chua,chui,chun,chuo,chuai,chuan,chuang
sh|19|sha,shai,shan,shao,shang,she,shei,shen,sheng,shi,shou,shu,shua,shui,shun,shuo,shuai,shuan,shuang

n|27|n,na,nai,nan,nao,nang,ne,nei,nen,neng,ng,ni,nie,nin,niu,nian,niao,ning,niang,nou,nong,nu,nun,nuo,nuan,nü,nüe
l|26|la,lai,lan,lao,lang,le,lei,leng,li,lia,lie,lin,liu,lian,liao,ling,liang,lo,lou,long,lu,lun,luo,luan,lü,lüe
d|23|da,dai,dan,dao,dang,de,dei,den,deng,di,dia,die,diu,dian,diao,ding,dou,dong,du,dui,dun,duo,duan
h|21|ha,hai,han,hao,hang,he,hei,hen,heng,hm,hng,hou,hong,hu,hua,hui,hun,huo,huai,huan,huang
m|20|m,ma,mai,man,mao,mang,me,mei,men,meng,mi,mie,min,miu,mian,miao,ming,mo,mou,mu
g|19|ga,gai,gan,gao,gang,ge,gei,gen,geng,gou,gong,gu,gua,gui,gun,guo,guai,guan,guang
k|19|ka,kai,kan,kao,kang,ke,kei,ken,keng,kou,kong,ku,kua,kui,kun,kuo,kuai,kuan,kuang
t|19|ta,tai,tan,tao,tang,te,teng,ti,tie,tian,tiao,ting,tou,tong,tu,tui,tun,tuo,tuan
p|17|pa,pai,pan,pao,pang,pei,pen,peng,pi,pie,pin,pian,piao,ping,po,pou,pu
z|17|za,zai,zan,zao,zang,ze,zei,zen,zeng,zi,zou,zong,zu,zui,zun,zuo,zuan
b|16|ba,bai,ban,bao,bang,bei,ben,beng,bi,bie,bin,bian,biao,bing,bo,bu
c|16|ca,cai,can,cao,cang,ce,cen,ceng,ci,cou,cong,cu,cui,cun,cuo,cuan
s|16|sa,sai,san,sao,sang,se,sen,seng,si,sou,song,su,sui,sun,suo,suan
r|15|ran,rao,rang,re,ren,reng,ri,rou,rong,ru,rua,rui,run,ruo,ruan
y|15|ya,yan,yao,yang,ye,yi,yin,ying,yo,you,yong,yu,yue,yun,yuan
j|14|ji,jia,jie,jin,jiu,jian,jiao,jing,jiang,jiong,ju,jue,jun,juan
q|14|qi,qia,qie,qin,qiu,qian,qiao,qing,qiang,qiong,qu,que,qun,quan
x|14|xi,xia,xie,xin,xiu,xian,xiao,xing,xiang,xiong,xu,xue,xun,xuan
f|10|fa,fan,fang,fei,fen,feng,fiao,fo,fou,fu
w| 9|wa,wai,wan,wang,wei,wen,weng,wo,wu
a| 5|a,ai,an,ang,ao
e| 5|e,ei,en,eng,er
o| 2|o,ou
```

- 韵母可与哪些声母组合

```sql
select
  PRINTF('%5s', follow_) || ' ',
  PRINTF('%02d', count(start_)) as start_total_,
  ' ' || group_concat (start_)
from
  (
    select distinct
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 3)
        else substr(value_, 2)
      end) as follow_,
      (case when substr(value_, 2, 1) = 'h'
        then substr(value_, 1, 2)
        else substr(value_, 1, 1)
      end) as start_
    from
      meta_pinyin_chars
  )
group by
  follow_
order by
  start_total_ asc,
  follow_ asc;
```

以上输出结果为：

```
      |05| a,e,m,n,o
    g |01| n
    m |01| h
    r |01| e
    n |02| a,e
    ü |02| l,n
   üe |02| l,n
 iong |03| j,q,x
   ng |03| a,e,h
   ue |04| j,q,x,y
   ia |05| d,j,l,q,x
 iang |05| j,l,n,q,x
  uai |06| g,h,k,  zh,ch,sh
 uang |06| g,h,k,  zh,ch,sh
   iu |07| d,j,l,m,n,q,x
   ua |07| g,h,k,r,  zh,ch,sh
    o |08| a,b,f,l,m,p,w,y
   in |09| b,j,l,m,n,p,q,x,y
  ian |10| b,d,j,l,m,n,p,q,t,x
   ie |10| b,d,j,l,m,n,p,q,t,x
  iao |11| b,d,f,j,l,m,n,p,q,t,x
  ing |11| b,d,j,l,m,n,p,q,t,x,y
   ui |12| c,d,g,h,k,r,s,t,z,  zh,ch,sh
   ei |14| b,d,f,g,h,k,l,m,n,p,w,z,  zh,sh
  ong |14| c,d,g,h,k,l,n,r,s,t,y,z,  zh,ch
   uo |14| c,d,g,h,k,l,n,r,s,t,z,  zh,ch,sh
    e |16| c,d,g,h,k,l,m,n,r,s,t,y,z,  zh,ch,sh
   ai |17| b,c,d,g,h,k,l,m,n,p,s,t,w,z,  zh,ch,sh
   en |17| b,c,d,f,g,h,k,m,n,p,r,s,w,z,  zh,ch,sh
   ao |18| b,c,d,g,h,k,l,m,n,p,r,s,t,y,z,  zh,ch,sh
   ou |18| c,d,f,g,h,k,l,m,n,p,r,s,t,y,z,  zh,ch,sh
  uan |18| c,d,g,h,j,k,l,n,q,r,s,t,x,y,z,  zh,ch,sh
   un |18| c,d,g,h,j,k,l,n,q,r,s,t,x,y,z,  zh,ch,sh
    a |19| b,c,d,f,g,h,k,l,m,n,p,s,t,w,y,z,  zh,ch,sh
  eng |19| b,c,d,f,g,h,k,l,m,n,p,r,s,t,w,z,  zh,ch,sh
   an |20| b,c,d,f,g,h,k,l,m,n,p,r,s,t,w,y,z,  zh,ch,sh
  ang |20| b,c,d,f,g,h,k,l,m,n,p,r,s,t,w,y,z,  zh,ch,sh
    i |20| a,b,c,d,e,j,l,m,n,p,q,r,s,t,x,y,z,  zh,ch,sh
    u |24| b,c,d,f,g,h,j,k,l,m,n,o,p,q,r,s,t,w,x,y,z,  zh,ch,sh
```

- 韵母列表

```sql
-- 韵母列表
select distinct
  (case when substr(value_, 2, 1) = 'h'
    then substr(value_, 3)
    else substr(value_, 2)
  end) as follow_
from
  meta_pinyin_chars
order by
  follow_ asc;
```

以上输出结果为：

```
a
ai
an
ang
ao
e
ei
en
eng
g
i
ia
ian
iang
iao
ie
in
ing
iong
iu
m
n
ng
o
ong
ou
r
u
ua
uai
uan
uang
ue
ui
un
uo
ü
üe
```

- 根据词典表统计声母的使用占比

```sql
attach '/path/to/data/pinyin-word-dict.sqlite' as word;

drop table if exists pinyin_starts_weight;
create temp table pinyin_starts_weight as
  select
    (case when substr(t_.chars_, 2, 1) = 'h'
      then substr(t_.chars_, 1, 2)
      else substr(t_.chars_, 1, 1)
    end) as starts_,
    sum(t_.weight_) as weight_
  from (
    select
      w_.spell_chars_ as chars_,
      sum(pw_.weight_) as weight_
    from
      phrase_word pw_
      inner join pinyin_word w_ on pw_.word_id_ = w_.id_
    group by
      w_.spell_chars_
  ) t_
  group by
    starts_;

select
  PRINTF('%3s', starts_) || ' ',
  ' ' || (
    ROUND(weight_ * 100.0 / (
      select sum(weight_) from pinyin_starts_weight
    ), 2)
  ) || '%'
from pinyin_starts_weight
order by
  weight_ desc
;
```

以上输出结果为：

```
  d | 15.35%
  y | 8.68%
 sh | 6.57%
  h | 6.41%
  t | 6.28%
  l | 5.08%
  j | 4.95%
  b | 4.4%
  x | 4.32%
 zh | 4.19%
  n | 3.89%
  m | 3.54%
  q | 3.44%
  g | 3.44%
  z | 3.11%
 ch | 2.76%
  w | 2.67%
  f | 2.21%
  r | 1.82%
  k | 1.61%
  c | 1.47%
  s | 1.41%
  p | 0.99%
  e | 0.89%
  a | 0.49%
  o | 0.03%
```

- 根据词典表统计韵母首字母的使用占比

```sql
attach '/path/to/data/pinyin-word-dict.sqlite' as word;

drop table if exists pinyin_vowel_starts_weight;
create temp table pinyin_vowel_starts_weight as
  select
    (case when substr(t_.chars_, 2, 1) = 'h'
      then substr(t_.chars_, 3, 1)
      else substr(t_.chars_, 2, 1)
    end) as starts_,
    sum(t_.weight_) as weight_
  from (
    select
      w_.spell_chars_ as chars_,
      sum(pw_.weight_) as weight_
    from
      phrase_word pw_
      inner join pinyin_word w_ on pw_.word_id_ = w_.id_
    group by
      w_.spell_chars_
  ) t_
  where
    starts_ != ''
    -- 统计指定声母的韵母占比
    -- and substr(t_.chars_, 1, 1) in ('b','m','f','w','p')
  group by
    starts_;

select
  '  ' || starts_ || ' ',
  ' ' || (
    ROUND(weight_ * 100.0 / (
      select sum(weight_) from pinyin_vowel_starts_weight
    ), 2)
  ) || '%'
from pinyin_vowel_starts_weight
order by
  weight_ desc
;
```

以上输出结果为：

```
  i | 29.33%
  e | 23.58%
  a | 21.38%
  u | 18.05%
  o | 6.51%
  r | 0.78%
  ü | 0.2%
  n | 0.19%
  g | 0.0%
```

### 按表情查询

- 表情及其关键字信息

```sql
select
  id_,
  value_,
  group_,
  group_concat(keyword_, ', ')
from
  emoji
group by
  id_;
```

## 新旧版本数据迁移

Note：核心元数据（拼音、字、字读音）的 `id_` 和 `value_`
不能发生变化，否则，已发布的输入法将出现用户已输入短语失效的问题。

> 操作之前务必先备份旧版本的数据库文件。

```sql
pragma foreign_keys = 0;
pragma ignore_check_constraints = 1;

-- 直接删除不紧要或变更元数据不会影响输入法用户数据的表
drop table meta_word_cangjie_code;
drop table meta_word_sijiao_code;
drop table meta_word_wubi_code;
drop table meta_word_zhengma_code;
drop table meta_zhuyin;
drop table meta_zhuyin_chars;
drop table meta_phrase;
drop table link_phrase_with_pinyin_word;
drop table link_phrase_with_zhuyin_word;
drop table link_word_with_simple_word;
drop table link_word_with_traditional_word ;
drop table link_word_with_variant_word;
drop table link_word_with_zhuyin;
drop view pinyin_phrase;
drop view pinyin_word;
drop view simple_word;
drop view traditional_word;
drop view zhuyin_phrase;
drop view zhuyin_word;

-- 对核心的元数据表进行结构变更，直接变更为新版本的表结构
-- Note：新增的非空列，只能设置为 default null，完整性由代码检查
alter table meta_pinyin add column chars_id_ integer default null references meta_pinyin_chars (id_);
alter table meta_word drop column radical_;
alter table meta_word drop column radical_stroke_count_;
alter table meta_word add column radical_id_ integer default null references meta_word_radical (id_);

-- 添加新表，并从原始表中迁移元数据，以确核型元数据的 id 和相互间的关联不变
create table meta_word_with_pinyin (
  id_ integer not null primary key,
  -- 字 id
  word_id_ integer not null,
  -- 拼音 id
  spell_id_ integer not null,
  -- 字形权重：用于对相同拼音字母组合的字按字形相似性排序
  glyph_weight_ integer default 0,
  -- 按使用频率等排序的权重
  weight_ integer default 0,
  unique (word_id_, spell_id_),
  foreign key (word_id_) references meta_word (id_),
  foreign key (spell_id_) references meta_pinyin (id_)
);

insert into
  meta_word_with_pinyin (id_, word_id_, spell_id_, glyph_weight_, weight_)
select
  id_, source_id_, target_id_, glyph_weight_, weight_
from link_word_with_pinyin;

-- 删除旧表
drop table link_word_with_pinyin;

pragma foreign_keys = 1;
pragma ignore_check_constraints = 1;

-- 数据库无用空间回收
vacuum;

-- 执行数据更新/升级脚本: npm run generate:sqlite:word
-- 检查新旧版本数据是否存在差异（注意修改新旧数据库文件名）: npm run generate:sqlite:word:diff
```

## 参考资料

- [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data):
  汉字拼音数据。注：本工具以该项目 `zdic.txt` 中的汉字为基础数据，从汉典网拉取详细的字信息
- [BYVoid/OpenCC](https://github.com/BYVoid/OpenCC):
  中文簡繁轉換開源項目，支持詞彙級別的轉換、異體字轉換和地區習慣用詞轉換（中國大陸、臺灣、香港、日本新字體）。
  注：本工具根据该项目 `data/dictionary/TSCharacters.txt` 中的数据确定繁/简字的转换关系
-
- [OrangeX4/simple-pinyin](https://github.com/OrangeX4/simple-pinyin):
  简易拼音输入法（拼音转汉字），基于隐马尔可夫模型（HMM）做输入短语预测，含详细的 HMM 算法说明
- [letiantian/Pinyin2Hanzi](https://github.com/letiantian/Pinyin2Hanzi):
  拼音转汉字，可以作为拼音输入法的转换引擎，兼容 Python 2、Python 3
- [iseesaw/Pinyin2ChineseChars](https://github.com/iseesaw/Pinyin2ChineseChars):
  实现基于 Bigram+HMM 的拼音汉字转换系统
- [theajack/cnchar](https://github.com/theajack/cnchar):
  功能全面的汉字工具库 (拼音 笔画 偏旁 成语 语音 可视化等)
- [mozillazg/phrase-pinyin-data](https://github.com/mozillazg/phrase-pinyin-data):
  词语拼音数据
- [secsilm/zi-dataset](https://github.com/secsilm/zi-dataset):
  汉字数据集，包括汉字的相关信息，例如笔画数、部首、拼音、英文释义/同义词等
