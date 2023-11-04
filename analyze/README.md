拼音按键布局在线分析工具
==============================

> 本代码改造自
> [Force-Directed Tree](https://observablehq.com/@d3/force-directed-tree@183)
> 和 [Collapsible tree](https://observablehq.com/@d3/collapsible-tree)。

在当前目录中执行命令以启动静态页面服务：

```sh
npx http-server
```

> 需先安装 [NodeJS](https://nodejs.org/)。

## 汉语拼音字母后继树

访问地址 http://127.0.0.1:8080/char-tree.html
以查看拼音的后继字母的树形结构，从而规划出适和滑屏输入的拼音字母的按键布局。

> 代码为 [char-tree.js](./char-tree.js)。

![](../assets/img/pinyin-char-tree.png)

## 汉语拼音字母组合树

访问地址 http://127.0.0.1:8080/char-links.html
以查看拼音字母的组合关系。

> 代码为 [char-links.js](./char-links.js)。

![](../assets/img/pinyin-char-links.png)

## 汉语拼音划词模拟

访问地址 http://127.0.0.1:8080/simulate.html
以查看规划的按键布局是否符合要求。

> 代码为 [simulate.js](./simulate.js)。

![](../assets/img/pinyin-key-layout.png)
