---
title: 'CSS 自定义属性与设计令牌'
description: '用 --变量 管理颜色、间距、圆角，配合作用域与 fallback，做出可切换的主题。'
pubDate: 2026-11-19
category: '前端基础'
tags: ['CSS', '主题']
pinned: false
draft: false
---

CSS 自定义属性（常叫 CSS 变量）用 `--名字` 声明、`var()` 读取。它和预处理器变量最大的区别是**运行时可变**——改一个值，所有引用它的地方即时生效，这是做主题切换的根基。

## 基础用法

```css
:root {
  --bg: 12, 14, 18;        /* 深色底 */
  --ink: 236, 235, 230;    /* 浅色字 */
  --accent: 255, 106, 43;  /* 强调色 */
}

.card {
  background: rgb(var(--bg));
  color: rgb(var(--ink));
}
```

把颜色拆成 RGB 三个数字再拼 `rgb(var(--x))`，是因为这样可以用 `rgb(var(--x) / 0.5)` 轻松做出半透明色——直接存 `#fff` 就做不到。

## 作用域与 fallback

```css
/* 变量会向下继承，也能在任意选择器里覆盖 */
.dark { --bg: 12, 14, 18; }
.light { --bg: 246, 246, 243; }

/* var() 的第二个参数是默认值 */
.card { color: var(--accent, 255, 255, 255); }
```

配合一个根元素上的 `data-theme` 属性，就能整站换肤：

```css
html[data-theme='light'] { --bg: 246, 246, 243; --ink: 20, 20, 18; }
html[data-theme='dark']  { --bg: 12, 14, 18;  --ink: 236, 235, 230; }
```

## 设计令牌：把变量系统化

散落的变量难维护，于是有了「设计令牌」——把设计决策（颜色、字号、间距、圆角、阴影）全部收拢成一组命名清晰的变量：

```css
:root {
  /* 颜色 */
  --bg: 12, 14, 18;
  --ink: 236, 235, 230;
  --muted: 150, 150, 145;
  --accent: 255, 106, 43;
  --line: 255, 255, 255;

  /* 间距 */
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-4: 1rem;
  --sp-6: 1.5rem;

  /* 圆角 */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 16px;
}
```

好处：改一处主题色，全站同步；要加「浅色模式」只需覆盖根变量，不用改任何组件。

## 在 JS 里读写

```js
// 读
const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg');
// 写
document.documentElement.style.setProperty('--accent', '0, 122, 255');
```

## 与 preprocessor 变量的区别

| | CSS 自定义属性 | Sass/Less 变量 |
| --- | --- | --- |
| 作用时机 | 运行时，可动态改 | 编译时，写死进产物 |
| 作用域 | 继承 + 覆盖，符合 CSS 规则 | 词法作用域 |
| 能否主题切换 | 能，改根变量即可 | 不能，需编译多份 |

## 注意

- 自定义属性**大小写敏感**，`--bg` 和 `--BG` 是两个变量。
- 它在 `var()` 里不能嵌套计算，想算就用 `calc()`：`width: calc(var(--sp-4) * 2)`。
- 旧浏览器（IE）不支持，现代项目基本可以放心用。

简单说：**颜色、间距、圆角这类会被反复用到的设计值，都值得抽成变量**。它让主题切换从「改几百处」变成「改一处」。
