---
title: '浏览器事件循环与微任务'
description: '为什么 setTimeout 不是精确的，Promise 为什么总插队——读懂事件循环就懂了。'
pubDate: 2026-11-20
category: 'Web 原理'
tags: ['JavaScript', '核心']
pinned: false
draft: false
---

JavaScript 是单线程的，但浏览器要同时处理网络、定时器、渲染。这一切靠**事件循环（Event Loop）**调度：主线程一次只做一件事，做完一件再从「待办队列」里取下一件。

## 两类队列：宏任务 vs 微任务

- **宏任务（Task）**：整段 `<script>`、`setTimeout`、`setInterval`、I/O、UI 事件。
- **微任务（Microtask）**：`Promise.then` / `catch` / `finally`、`queueMicrotask`、`MutationObserver`。

执行顺序是：**先清空当前宏任务 → 再清空所有微任务 → 渲染（如果该帧需要）→ 取下一个宏任务**。

```js
console.log('1');                       // 同步，立刻
setTimeout(() => console.log('2'), 0);  // 宏任务，排最后
Promise.resolve().then(() => console.log('3')); // 微任务
console.log('4');

// 输出：1 4 3 2
```

为什么 `3` 在 `2` 前面？因为当前这段 `<script>` 是一个宏任务，它执行完（打印 1、4）后，事件循环会**先把微任务队列清空**（打印 3），然后才轮到下一个宏任务 `setTimeout`（打印 2）。

## 微任务里再放微任务，会一直拖下去

```js
Promise.resolve().then(function loop() {
  console.log('looping');
  Promise.resolve().then(loop);   // 无限往微任务里塞
});
setTimeout(() => console.log('卡住了'), 1000);
// '卡住了' 永远不打印：微任务永远清不完，宏任务永远轮不到
```

这就是为什么「微任务里做重活」会卡死页面——渲染和定时器都被无限延后。

## setTimeout(0) 为什么不精确

`setTimeout(fn, 0)` 不是「0 毫秒后执行」，而是「尽快放到宏任务队列」，实际要等：
1. 当前宏任务执行完；
2. 微任务队列清空；
3. 浏览器可能先做渲染。

而且浏览器对嵌套的 `setTimeout` 有**最小 4ms** 的限制，所以在动画或高频循环里别用它，该用 `requestAnimationFrame`。

## 一道经典题

```js
setTimeout(() => console.log('A'), 0);
Promise.resolve().then(() => console.log('B')).then(() => console.log('C'));
console.log('D');
```

输出：`D B C A`。原因：
1. `D` 是同步代码，先打印。
2. 当前宏任务结束，清空微任务：`B`，再 `C`（链式 then）。
3. 轮到宏任务 `setTimeout`，打印 `A`。

## 与 async/await 的关系

`await` 后面的部分会被拆成微任务：

```js
async function f() { console.log('1'); await 0; console.log('2'); }
f();
console.log('3');
// 输出：1 3 2 —— await 让 '2' 变成了微任务
```

## 记住这张图

```
宏任务 ──执行──▶ 微任务（全部清空）──▶ 渲染 ──▶ 下一个宏任务 ──▶ ...
```

一句话总结：**同步代码最快，微任务其次（且要全部清空），宏任务最后**。理解了这个顺序，那些「为什么这个先执行」的困惑就都解开了。
