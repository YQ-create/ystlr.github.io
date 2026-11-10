---
title: 'HTML 语义化与常用标签速查'
description: '从文档骨架到表单：用对的标签，而不是把所有东西都写成 div。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['入门', '前端']
pinned: true
draft: false
---

HTML 只负责一件事：**描述内容是什么**。它不负责长什么样（那是 CSS），也不负责点击后发生什么（那是 JavaScript）。所谓「语义化」，就是让标签本身说清楚内容的角色 —— 屏幕阅读器、搜索引擎和半年后的自己都能读懂。

## 最小可用的文档骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>页面标题</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <h1>主标题</h1>
    <p>第一段正文。</p>
    <script src="/main.js" defer></script>
  </body>
</html>
```

几个约定值得固定下来：`<!DOCTYPE html>` 声明标准模式；`charset` 必须放在 `<head>` 最前面，否则中文可能乱码；移动端一定要写 `viewport`；脚本加 `defer` 就不会阻塞解析。

## 常用标签速查

| 标签 | 用途 | 注意 |
| --- | --- | --- |
| `h1`–`h6` | 标题层级 | 一个页面通常只有一个 `h1`，级别不要跳着用 |
| `p` | 段落 | 里面不能放 `div`、`p` 等块级元素 |
| `a` | 链接 | 外链建议加 `rel="noopener noreferrer"`（配合 `target="_blank"`） |
| `img` | 图片 | `alt` 必填；装饰性图片用 `alt=""` |
| `ul` / `ol` / `li` | 列表 | `ul`/`ol` 的直接子元素只能是 `li` |
| `em` / `strong` | 强调 / 重要 | 有语义，别只为了斜体粗体而用 |
| `code` / `pre` | 行内代码 / 代码块 | 代码块用 `<pre><code>…</code></pre>` 嵌套 |
| `table` | 表格数据 | 配 `thead` / `tbody` / `th`；别拿它做布局 |
| `button` | 可点击操作 | 需要跳转就用 `a`，需要执行动作就用 `button` |
| `time` | 机器可读时间 | 用 `datetime` 属性写标准格式 |

## 语义化布局

```html
<header>
  <nav aria-label="主导航">…</nav>
</header>
<main>
  <article>
    <h1>文章标题</h1>
    <section><h2>小节</h2><p>…</p></section>
  </article>
  <aside>相关链接</aside>
</main>
<footer>版权信息</footer>
```

`header` / `nav` / `main` / `article` / `section` / `aside` / `footer` 都是「带含义的 div」。它们默认样式几乎为零，但会给辅助技术提供导航地标，`main` 还能让「跳到主要内容」的快捷键生效。

## 表单：把 label 和控件绑起来

```html
<form action="/search" method="get">
  <label for="q">关键词</label>
  <input id="q" name="q" type="search" required placeholder="输入关键词" />
  <label for="scope">范围</label>
  <select id="scope" name="scope">
    <option value="all">全部</option>
    <option value="title">仅标题</option>
  </select>
  <button type="submit">搜索</button>
</form>
```

`label` 的 `for` 要对上控件的 `id`：点击文字就能聚焦，读屏软件也会念出字段名。提交时靠的是 `name`，不是 `id`。常用的 `type` 还有 `email`、`tel`、`number`、`date`、`checkbox`、`radio`，浏览器会顺带做基础校验和合适的移动端键盘。

## 容易踩的坑

- **一律用 `div`**：整页 `<div class="header">` 能显示，但失去了地标与可访问性，后续维护只能靠猜 class 名。
- **用 `<br>` 撑间距**：换行是内容的一部分时才用 `br`，排版间距交给 CSS 的 `margin` / `gap`。
- **`<p>` 里塞块元素**：浏览器会自动把段落拆开，DOM 结构和你写的不一样。
- **图片不写 `alt`**：加载失败时用户看不到任何提示，读屏软件也可能念出文件名。
- **`target="_blank"` 不写 `rel`**：新页面能通过 `window.opener` 反向操作原页面，属于安全隐患。
- **把多个 `h1` 当样式用**：标题级别是文档大纲，想调字号请改 CSS。

## 参考

依据 [菜鸟教程 · HTML 教程](https://www.runoob.com/html/html-tutorial.html) 的章节脉络（元素、属性、标题/段落、链接、图像、表格、列表、布局、表单、头部）整理。本文是学习要点归纳，说明与示例均为自行编写，完整标签清单可查 [HTML 参考手册](https://www.runoob.com/tags/html-reference.html)。
