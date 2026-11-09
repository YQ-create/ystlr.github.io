---
title: 'CSS 过渡、变换与动画速查'
description: 'transition、transform、keyframes 的分工，以及哪些属性动起来不卡、哪些一动就掉帧。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['前端', 'CSS', '动效']
pinned: false
draft: false
---

动效先分清三件事：**状态之间平滑过渡**用 `transition`，**改变元素的视觉位置/形状**用 `transform`，**多步骤或自动循环的过程**用 `@keyframes`。选错工具比参数调不准更容易出问题。

## 三个工具怎么选

| 需求 | 用什么 | 触发方式 |
| --- | --- | --- |
| hover 时颜色渐变 | `transition` | 状态变化（`:hover` / class 切换） |
| 卡片上浮、图标旋转 | `transform` + `transition` | 状态变化 |
| 加载转圈、循环脉冲 | `@keyframes` + `animation` | 自动播放 |
| 展开/收起内容 | `transition` 配合尺寸或 `grid-template-rows` | class 切换 |

```css
.card {
  transition: transform 240ms ease-out, box-shadow 240ms ease-out;
  will-change: auto; /* 别全局挂着 */
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.18);
}
```

## transition 的组成

```css
/* 属性 | 时长 | 缓动 | 延迟 */
transition: opacity 200ms ease, transform 300ms cubic-bezier(.2, .8, .2, 1) 50ms;
```

| 参数 | 常用值 | 说明 |
| --- | --- | --- |
| `property` | `opacity`、`transform`、`color` | 写 `all` 会把意外变化的属性也一起动起来 |
| `duration` | 150–300ms | 微交互别超过 300ms，否则显得迟钝 |
| `timing-function` | `ease-out`、`cubic-bezier(...)` | 进场用 ease-out，退场用 ease-in |
| `delay` | `0` / 几十毫秒 | 级联动画常用，别叠太长 |

缓动曲线的选择比时长更影响手感：**元素进入视野用减速（ease-out），离开用加速（ease-in）**，线性 `linear` 只适合旋转、进度条这类匀速运动。

## transform 与 keyframes

`transform` 不触发重排，只影响合成层的绘制，是性能最友好的「位移」方式。多个函数按书写顺序依次作用，顺序不同结果也不同。

```css
.badge {
  transform: translate(-50%, -50%) rotate(-8deg) scale(1.05);
  transform-origin: center;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: .65; transform: scale(.94); }
}
.spinner { animation: pulse 1.4s ease-in-out infinite; }
```

| `animation` 子属性 | 作用 |
| --- | --- |
| `animation-duration` | 一轮时长 |
| `animation-iteration-count` | `1` / `infinite` |
| `animation-direction` | `alternate` 可来回播放，省一半关键帧 |
| `animation-fill-mode` | `forwards` 保留结束状态，避免动画结束瞬间跳回 |
| `animation-play-state` | `paused` 可在页面隐藏时停掉 |

## 性能与无障碍

浏览器每帧依次走「布局 → 绘制 → 合成」。`transform` 与 `opacity` 可以只在**合成**阶段完成；改 `width` / `top` / `margin` 则会反复触发布局，长列表滚动时最容易掉帧。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

`prefers-reduced-motion` 不是可选项：前庭功能敏感的用户会被大面积位移、视差和自动循环动画影响，系统里开了「减少动态效果」就该尊重。

## 容易踩的坑

- **过渡写在 `:hover` 上**：鼠标移入有动画、移出瞬间弹回。基础状态写 `transition`，hover 里只写目标值。
- **用 `top` / `left` 做位移动画**：触发布局，换成 `transform: translate()`。
- **`transition: all`**：新增属性时容易出现意料之外的动画，还会有性能开销，逐项列出更可控。
- **动画元素没设 `transform-origin`**：旋转、缩放绕错中心点，看起来像「歪了」。
- **给一堆元素常挂 `will-change`**：每层都会占显存，反而拖慢滚动；只在交互开始前短期添加。
- **忘了 `animation-fill-mode`**：动画结束后元素跳回初始状态，视觉上像闪了一下。
- **`display: none` 到 `block` 也想要过渡**：`display` 不可过渡，改用 `opacity` + `visibility`，或用 `grid-template-rows: 0fr → 1fr` 做展开。
- **无限动画不看页面可见性**：后台标签页仍在跑，配合 `visibilitychange` 暂停更省电。

## 参考

依据 [菜鸟教程 · CSS3 教程](https://www.runoob.com/css3/css3-tutorial.html) 的知识脉络（过渡、变换、动画）整理，性能与无障碍部分参照 [MDN · Reflow](https://developer.mozilla.org/zh-CN/docs/Glossary/Reflow) 与 [MDN · requestAnimationFrame](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame)。本文为要点归纳与自写示例。
