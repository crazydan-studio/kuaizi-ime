本模块负责为站点 [hanzi.crazydan.io](https://hanzi.crazydan.io)
构建拼音以及汉字笔画相关资源。

## 第一阶段 - 准备站点数据

- 执行 `pnpm run data:zi` 准备汉字信息数据
- 执行 `pnpm run site:hanzi.crazydan.io:fetch-media` 拉取拼音音频和汉字笔画图等多媒体文件
- 执行 `pnpm run site:hanzi.crazydan.io:gen-stroke` 根据汉字笔画图生成 SVG 矢量图
- 执行 `pnpm run site:hanzi.crazydan.io:gen-data` 生成站点基础数据，以 JSON 文件记录汉字基本信息，
  站点通过这些 JSON 文件在页面展示汉字信息

## 第二阶段 - 分析站点数据

- 执行 `pnpm run site:hanzi.crazydan.io:analyze:prepare` 准备待分析的汉字笔画路径等数据
- 执行 `pnpm run site:hanzi.crazydan.io:analyze:stroke-similarity` 根据汉字笔画路径计算笔画特征值，
  再根据笔画特征值将相似形状的笔画归为一类

## 第三阶段 - 提升站点数据质量

在 `../../../../../site/hanzi.crazydan.io/` 目录中启动（`pnpm run dev`）本地开发服务，
并在浏览器访问 `/zi/strokes/` 以查看笔画分类准确度、绘制笔画书写路径等。

若笔画分类效果不佳，则尝试反复调整 `analyze/stroke-similarity.sh` 内的相关参数后再执行
`pnpm run site:hanzi.crazydan.io:analyze:stroke-similarity`。
