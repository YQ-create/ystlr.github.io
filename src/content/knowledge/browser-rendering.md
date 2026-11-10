---
title: '浏览器渲染流程与重排重绘速查'
description: '从 HTML 到像素的几步流水线，哪些属性会触发布局，以及为什么「先改 class 再读高度」会卡。'
pubDate: 2026-11-09
category: 'Web 原理'
tags: ['进阶', '前端']
pinned: false
draft: false
---

页面卡顿多数不是「JS 算得太慢」，而是**脚本逼着浏览器把本可以攒到帧末的布局提前算了一遍**。理解流水线，才知道哪一类读写组合会触发强制同步布局。

## 一帧里发生了什么

```
HTML → DOM 树
CSS  → CSSOM 树
DOM + CSSOM → Render Tree（只含要显示的元素）
Layout  计算每个盒子的位置与尺寸
Paint   生成绘制记录（文字、颜色、阴影、边框）
Composite 把图层交给 GPU 合成到屏幕
```

| 阶段 | 由什么触发 | 代价 |
| --- | --- | --- |
| 重排 Layout | 改几何属性（`width`、`top`、`font-size`）、增删节点 | 最高，常常连带后续阶段 |
| 重绘 Paint | 改外观但不改几何（`color`、`background`、`box-shadow`） | 中等，跳过布局 |
| 合成 Composite | 只改 `transform` / `opacity` | 最低，可完全避开主线程布局 |

**只会合成的属性是动效首选**：`transform`、`opacity`（配合提升到独立层）。CSS 的 `will-change`、`filter`、`backdrop-filter` 会影响分层策略，但层不是越多越好。

## 强制同步布局

```js
// ❌ 一次循环里反复「写 → 读」，每轮都逼浏览器重排
for (const el of items) {
  el.classList.add('is-active');
  console.log(el.offsetHeight);   // 读取几何 → 立刻 flush 布局
}

// ✅ 先集中读，再集中写
const heights = items.map(el => el.offsetHeight);
items.forEach((el, i) => {
  el.style.setProperty('--h', `${heights[i]}px`);
});
```

会被「读一下就得算布局」的属性大致是：`offsetTop/Left/Width/Height`、`scrollTop/Left/Width/Height`、`clientTop/Left/Width/Height`、`getBoundingClientRect()`、`getComputedStyle()`（部分场景）。把它们集中到写入之前，一帧通常只算一次。

## 加载阶段的关键路径

| 资源 | 对首屏的影响 | 常用处理 |
| --- | --- | --- |
| CSS | 阻塞渲染（Render Tree 需要 CSSOM） | 内联关键样式、压缩、拆分非关键 CSS |
| 同步 `<script>` | 阻塞 HTML 解析 | 放末尾，或用 `defer` / `type="module"` |
| 字体 | 影响文字绘制，可能闪烁 | `font-display: swap`、预加载关键字体 |
| 首屏图片 | 影响 LCP | 定宽高、懒加载非首屏图、响应式尺寸 |
| 第三方脚本 |  unpredictable 的长任务 | 延后到交互后加载、设 `async` |

`defer` 与 `async` 的区别：`defer` 按文档顺序、在解析完成后统一执行；`async` 下载完就执行，顺序不确定。依赖 DOM 或其他脚本的用 `defer`。

## Core Web Vitals 速查

| 指标 | 看什么 | 常见优化 |
| --- | --- | --- |
| LCP | 最大内容元素何时画出来 | 优化首屏图、TTFB、去掉阻塞渲染的资源 |
| INP | 交互到下一帧的响应 | 拆长任务、减少主线程工作、避免强制同步布局 |
| CLS | 视觉跳动幅度 | 图片/广告位预留尺寸、别在已有内容上方插入元素 |

## 容易踩的坑

- **滚动回调里读写交替**：`classList.add(...)` 之后立刻读 `offsetHeight`，每帧强制同步回流，滚动必卡。
- **用 `top` / `left` / `width` 做动画**：每帧重排，换成 `transform`。
- **在 `requestAnimationFrame` 之外改动画样式**：定时器与帧率不同步，容易掉帧或抖动。
- **不给图片设 `width` / `height`**：加载完成后把下方内容顶开，CLS 直接飙上去。
- **滥用 `will-change` / 整页 `backdrop-filter`**：每个都创建合成层，显存与合成成本都上涨。
- **同步脚本放在 `<head>`**：解析被卡住，首屏一片白；用 `defer` 或 `type="module"`。
- **把所有优化押在压缩 JS 上**：真正拖慢首屏的常常是图片体积、字体与第三方脚本。
- **在 `IntersectionObserver` 回调里批量读布局**：多个回调连续触发时仍会叠加成一次「布局抖动」，读数要缓存或合并。

## 参考

依据 [MDN · Reflow（重排）](https://developer.mozilla.org/zh-CN/docs/Glossary/Reflow) 与 [MDN · requestAnimationFrame](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame) 的知识脉络整理。本文为要点归纳与自写示例，网络阶段可对照本知识库的《从网址到页面：DNS、TCP/IP 与 TLS 速查》。
