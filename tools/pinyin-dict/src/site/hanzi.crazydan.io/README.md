本模块负责为站点 [hanzi.crazydan.io](https://hanzi.crazydan.io)
构建拼音以及汉字笔画相关资源。

## 第一阶段 - 准备站点数据

- 执行 `pnpm run data:zi` 准备汉字信息数据
- 执行 `pnpm run site:hanzi.crazydan.io:fetch-media` 拉取拼音音频等多媒体文件
- 执行 `pnpm run site:hanzi.crazydan.io:gen-data` 生成站点基础数据
