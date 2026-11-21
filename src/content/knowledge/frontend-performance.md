---
title: '前端性能优化：从加载到渲染'
description: '一条页面请求的生命周期里，每个阶段可以做什么，以及最值得先做的三件事。'
pubDate: 2026-11-19
category: '工程实践'
tags: ['性能', '前端']
stage: '实战'
topics: ['前端']
prerequisites: ['browser-rendering']
pinned: false
draft: false
---

性能优化的本质不是「让代码跑得更快」，而是**减少用户等待的感知**。一条请求从发出到画面可交互，大致分四段：加载 → 解析 → 渲染 → 运行。先定位瓶颈在哪一段，再动手，比盲目优化更有用。

## 先量，再优化

优化的第一步永远是测量。打开 DevTools：

- **Network**：看资源体积、数量、瀑布图里谁在阻塞。
- **Performance**：录一段，看 FCP（首次内容绘制）、LCP（最大内容绘制）、CLS（布局偏移）。
- **Lighthouse**：一键给分，附带具体建议。

核心指标记住三个：**LCP**（2.5s 内算好）、**INP**（交互响应，200ms 内）、**CLS**（0.1 以内）。先盯着拖后腿的那个改。

## 加载阶段：让资源更小更少

| 手段 | 做法 | 效果 |
| --- | --- | --- |
| 压缩 | 图片用 WebP/AVIF，代码 gzip/brotli | 体积直接降一半以上 |
| 图片 | `<img>` 加 `srcset` 按屏取尺寸，懒加载 `loading="lazy"` | 少传不需要的像素 |
| 字体 | 只载需要的字重，`font-display: swap` | 避免文字闪烁和阻塞 |
| 拆包 | 路由级 `import()` 懒加载，vendor 单独缓存 | 首屏只下首屏的代码 |
| 缓存 | 长缓存 + 内容哈希，CDN 就近分发 | 二次访问几乎零成本 |

```js
// 路由级懒加载：只有访问到才下载对应代码
const About = () => import('./About.vue');
```

## 渲染阶段：少做无谓的布局

- **减少回流**：批量改样式用 `class` 而不是逐条改 `style`；读布局（`offsetHeight` 等）会强制同步回流，别在循环里读写混着来。
- **让动画走合成**：只动 `transform` / `opacity`，不碰 `width` / `top` / `left`。
- **长列表**：用虚拟滚动，只渲染可见的那几十条。
- **避免阻塞主线程**：重计算交给 `requestIdleCallback` 或 Web Worker。

```css
/* 走 GPU 合成，不触发回流 */
.box { transform: translateX(0); transition: transform 0.2s; }
.box:hover { transform: translateX(10px); }
```

## 运行时：别让脚本卡住交互

- **防抖/节流**：滚动、输入、resize 这些高频事件，先节流再处理。
- **`content-visibility: auto`**：跳过屏外内容的渲染，长页面收益明显。
- **防内存泄漏**：定时器、事件监听、闭包引用，用完清理。

```js
// 节流：滚动回调最多每 200ms 执行一次
let raf = 0;
window.addEventListener('scroll', () => {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; handleScroll(); });
});
```

## 最值得先做的三件事

1. **图片改 WebP + 懒加载**：大多数页面最大的开销就是图，改动小、见效快。
2. **拆包 + 路由懒加载**：把首屏 JS 降到最小。
3. **加好缓存与 CDN**：让回头客几乎瞬间打开。

先做完这三件，再去看那些更精细的手段。性能优化是「先摘低处的果子」，不是把每行代码都抠到极致。
