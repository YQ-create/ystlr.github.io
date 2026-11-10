---
title: 'SVG 与 Canvas 绘图速查'
description: '两套绘图模型的差别、常用图形与路径命令，以及清晰度、事件和性能上各自要注意什么。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['进阶', '前端']
pinned: false
draft: false
---

浏览器里画东西有两条路：**SVG 是「一堆可被引擎管理的矢量元素」，Canvas 是「一块你亲手涂的位图画布」**。需要交互、可缩放、要被 CSS 控制就用 SVG；需要逐帧大量绘制、像素级处理就用 Canvas。

## 怎么选

| | SVG | Canvas |
| --- | --- | --- |
| 模型 | 保留模式的 DOM 节点 | 立即模式的像素位图 |
| 缩放 | 矢量，任意倍率清晰 | 会模糊，需按 dpr 重设分辨率 |
| 事件 | 每个图形可单独绑定 | 只有画布一个事件，命中要自己算 |
| 样式 | 可用 CSS / 选择器 / 动画 | 全靠 `ctx` 的绘制状态 |
| 调试 | DevTools 里能直接看节点 | 只能看最终像素 |
| 适合 | 图标、图表、交互图形、装饰线 | 粒子、游戏、图像滤镜、大数据量绘制 |

## SVG：常用元素与路径

```html
<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="环形进度示意">
  <circle cx="60" cy="60" r="48" fill="none" stroke="#333" stroke-width="8" />
  <circle cx="60" cy="60" r="48" fill="none" stroke="#ff6a2b" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="302" stroke-dashoffset="98"
          transform="rotate(-90 60 60)" />
</svg>
```

| 元素 | 用途 |
| --- | --- |
| `<rect>` / `<circle>` / `<ellipse>` | 矩形、圆、椭圆 |
| `<line>` / `<polyline>` / `<polygon>` | 线、折线、多边形 |
| `<path d="…">` | 任意形状，最灵活 |
| `<g>` | 分组，变换与样式可整体施加 |
| `<defs>` / `<use>` | 定义与复用（渐变、图标） |
| `<text>` | 文字（可被选中、可被读屏读到） |

`viewBox="minX minY width height"` 决定内部坐标系，配合 CSS 的 `width: 100%` 就能自适应缩放，而不用改每个坐标。

| 路径命令 | 含义 | 示例 |
| --- | --- | --- |
| `M` / `m` | 移动画笔（大写绝对 / 小写相对） | `M 10 20` |
| `L` / `H` / `V` | 直线 / 水平 / 垂直 | `L 80 20` |
| `C` / `S` / `Q` / `T` | 三次 / 平滑三次 / 二次 / 平滑二次贝塞尔 | `C 20 0, 40 0, 60 20` |
| `A` | 圆弧 | `A 20 20 0 0 1 80 60` |
| `Z` | 闭合路径 | `Z` |

## Canvas：画布与绘制状态

```js
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const { width, height } = canvas.getBoundingClientRect();

canvas.width = Math.round(width * dpr);
canvas.height = Math.round(height * dpr);
ctx.scale(dpr, dpr);   // 之后仍按 CSS 像素书写坐标

ctx.clearRect(0, 0, width, height);
ctx.fillStyle = '#ff6a2b';
ctx.beginPath();
ctx.arc(60, 60, 32, 0, Math.PI * 2);
ctx.fill();

// 连续动画交给 rAF，并记得在取消时停掉
const raf = requestAnimationFrame(function frame(t) {
  draw(t);
  requestAnimationFrame(frame);
});
```

`ctx` 的状态（`fillStyle`、`lineWidth`、`transform`、`globalAlpha`）会一直延续到下一次修改，所以每段独立绘制前后用 `ctx.save()` / `ctx.restore()` 包起来，比手动还原每一个属性可靠。

## 容易踩的坑

- **Canvas 不处理 dpr**：高分屏上线条和文字发虚，必须把位图尺寸乘 dpr、再把坐标系 `scale` 回来。
- **只改 CSS 尺寸不改 `canvas.width`**：位图被拉伸，本质是模糊放大。
- **每帧不 `clearRect`**：残影叠加，看起来像「拖尾特效」其实是忘了清屏。
- **SVG 不写 `viewBox`**：缩放时图形被裁掉或无法自适应容器。
- **在 SVG 里塞几千个节点**：DOM 数量上来后交互变慢，这种量级该换 Canvas 或做虚拟化。
- **给 Canvas 里的「按钮」绑事件**：画布只有一个元素，命中检测要自己算坐标，可访问性也要另外补。
- **用 `<img>` 引 SVG 后还想改内部颜色**：外部 SVG 作为图片加载时，外部 CSS 进不去；要内联或用 `<use>` 配合 `currentColor`。
- **装饰性图形漏掉 `aria-hidden`**：读屏会把一堆无意义的 `<svg>` 念出来；有信息的图则补 `role="img"` 与 `aria-label`。
- **`ctx` 状态串味**：上一个函数设了 `globalAlpha`，下一个函数的图形莫名变淡。

## 参考

依据 [菜鸟教程 · SVG 教程](https://www.runoob.com/svg/svg-tutorial.html) 的知识脉络（元素、路径命令）整理，Canvas 部分参照 [MDN · Canvas API](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API) 与 [MDN · SVG](https://developer.mozilla.org/zh-CN/docs/Web/SVG)。本文为要点归纳与自写示例。
