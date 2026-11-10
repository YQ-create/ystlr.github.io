---
title: 'CSS 盒模型与布局体系速查'
description: '优先级、盒模型、Flex、Grid 与响应式：把「为什么没生效」变成可推导的问题。'
pubDate: 2026-11-08
category: '前端基础'
tags: ['入门', '前端']
pinned: false
draft: false
---

CSS 的大多数「诡异问题」都能归到三件事：**这条规则有没有赢过别的规则**（层叠与优先级）、**这个盒子到底多大**（盒模型）、**它参与了哪种布局上下文**（普通流 / Flex / Grid / 定位）。先判断属于哪一类，再查属性，效率会高很多。

## 层叠与优先级

优先级可以粗略记成四档计数：`内联样式` > `ID` > `类 / 属性 / 伪类` > `元素 / 伪元素`。同档时后写的赢，`!important` 会翻转常规顺序（但别把它当常规手段）。

| 选择器 | 例子 | 典型用途 |
| --- | --- | --- |
| 元素 | `p` | 基础默认值 |
| 类 | `.card` | 组件样式的主力 |
| 后代 / 子代 | `.card p` / `.card > p` | 限定作用域 |
| 属性 | `input[type="email"]` | 按状态选中 |
| 伪类 | `:hover`、`:focus-visible`、`:nth-child(2n)` | 交互与位置 |
| 伪元素 | `::before`、`::after` | 装饰性内容 |

`:focus-visible` 值得单独记：键盘聚焦时显示焦点环、鼠标点击时不显示，比简单粗暴地 `outline: none` 友好得多。

## 盒模型：先统一成 border-box

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

默认情况下 `width` 只算内容区（`content-box`），再加 `padding` 和 `border` 才是实际占位，所以「设了 100% 却溢出」几乎都源于此。统一成 `border-box` 后，`width` 就是最终宽度，布局可预测得多。

一个盒子的组成从内到外是：content → padding → border → margin。`margin` 不算进盒子尺寸，但会影响它和邻居的距离。

## Flex 与 Grid 怎么选

| | Flexbox | Grid |
| --- | --- | --- |
| 维度 | 一维（一行或一列） | 二维（行和列同时） |
| 适合 | 导航、按钮组、卡片内对齐 | 整页骨架、照片墙、表单栅格 |
| 谁来定尺寸 | 由内容或 `flex` 比例决定 | 由容器的 `grid-template-*` 决定 |

```css
/* 一维：水平居中 + 两端对齐 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

/* 二维：自适应列数，最小 240px，剩余空间平分 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
```

Flex 里最常用的三个属性：`flex-direction`（方向）、`justify-content`（主轴对齐）、`align-items`（交叉轴对齐）。子项上用 `flex: 1` 占据剩余空间、`flex-shrink: 0` 防止被压扁。

## 单位与响应式

```css
.title {
  /* 最小 1.5rem，随视口缩放，最大 2.5rem */
  font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem);
}

@media (max-width: 720px) {
  .sidebar { display: none; }
}
```

- `rem` 相对根字号，适合字号与间距；`em` 相对自身/父级字号，适合组件内比例。
- `vw` / `vh` 相对视口；`%` 相对父容器对应维度。
- 移动端优先时多写 `min-width` 断点，桌面优先用 `max-width`，同一个项目里别混着来。
- `clamp()` 能替代一大堆字号断点，配 `min()` / `max()` 处理宽度很好用。

## 容易踩的坑

- **外边距塌陷**：相邻块级元素的上下 `margin` 会合并成较大者；父子之间也可能「塌陷」出去。用 `gap`（Flex/Grid 容器内）可彻底绕开。
- **Flex 子项不肯收缩**：子项默认 `min-width: auto`，长内容会把容器撑破。给子项加 `min-width: 0` 通常就解决了。
- **百分比高度不生效**：父元素没有确定高度时，`height: 100%` 无从计算。改用 `min-height` 或让父级成为 Grid/Flex 容器。
- **`!important` 越用越多**：优先级军备竞赛最后没人改得动样式。更稳的做法是缩小选择器作用域、调整加载顺序。
- **只在开发环境尺寸下看**：断点要在真实窄屏（如 390px）与超宽屏各看一次，长单词、长表格、行内代码最容易溢出。
- **滥用 `will-change` / 大面积 `backdrop-filter`**：每个都会额外创建渲染层，滚动时容易掉帧，只在确实需要的元素上短期使用。

## 参考

依据 [菜鸟教程 · CSS 教程](https://www.runoob.com/css/css-tutorial.html) 与 [CSS3 教程](https://www.runoob.com/css3/css3-tutorial.html) 的知识脉络整理。本文为要点归纳与自写示例，属性速查可看 [CSS 参考手册](https://www.runoob.com/cssref/css-reference.html) 和 [选择器参考手册](https://www.runoob.com/cssref/css-selectors.html)。
