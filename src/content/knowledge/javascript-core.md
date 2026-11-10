---
title: 'JavaScript 核心语法与异步速查'
description: '类型、数组方法、DOM 事件与 Promise：日常开发真正反复用到的那部分。'
pubDate: 2026-11-07
category: '前端基础'
tags: ['入门', '前端']
pinned: false
draft: false
---

JavaScript 在浏览器里负责「行为」：读写 DOM、响应用户操作、发起网络请求。语言本身不大，但有几处设计与直觉不同，提前知道了能少踩很多坑。

## 变量与类型

优先用 `const`，需要重新赋值时用 `let`，不要再写 `var`（函数作用域 + 变量提升容易制造意外）。

| 分类 | 值 | 说明 |
| --- | --- | --- |
| 原始类型 | `string` `number` `boolean` `null` `undefined` `symbol` `bigint` | 按值比较 |
| 引用类型 | `object`（含数组、函数、日期） | 按引用比较 |

```js
const name = 'Astro';
let count = 0;

typeof null;        // 'object' —— 历史遗留，别用它判断 null
Array.isArray([]);  // true，判断数组用这个
Number.isNaN(NaN);  // true，全局 isNaN 会先强制转换
```

判空时 `value == null` 能同时命中 `null` 和 `undefined`，是少数几个可以放心用 `==` 的场景；其它一律用 `===`。falsy 值只有 8 个：`false`、`0`、`-0`、`0n`、`""`、`null`、`undefined`、`NaN` —— 注意 `[]` 和 `{}` 都是 truthy。

## 常用语法糖

```js
const { title, tags = [] } = note;          // 解构 + 默认值
const next = [...tags, 'CSS'];              // 展开
const slug = title.toLowerCase().replaceAll(' ', '-');

const double = (n) => n * 2;               // 箭头函数
const label = `共 ${next.length} 条`;       // 模板字符串
const key = isDraft ? 'draft' : 'public';  // 三元

const exists = list.some((x) => x.id === id); // 存在性判断
```

箭头函数没有自己的 `this`，所以它适合回调，不适合当对象方法或构造函数。

## 数组方法速查

| 方法 | 返回 | 用途 |
| --- | --- | --- |
| `map` | 新数组 | 逐项转换 |
| `filter` | 新数组 | 按条件筛子集 |
| `find` | 元素或 `undefined` | 找第一个匹配项 |
| `some` / `every` | 布尔 | 是否存在 / 是否全部满足 |
| `reduce` | 任意值 | 聚合成一个数或对象 |
| `forEach` | `undefined` | 只做副作用 |
| `flat` / `flatMap` | 新数组 | 拍平嵌套 |
| `sort` | **原数组** | 原地排序，会改动原值 |

```js
const titles = notes.map((n) => n.title);
const published = notes.filter((n) => !n.draft);
const byCategory = notes.reduce((acc, n) => {
  (acc[n.category] ??= []).push(n);
  return acc;
}, {});
```

`sort()` 默认按字符串比较，排数字必须写 `(a, b) => a - b`；不想改动原数组就先 `[...arr].sort()`。

## 异步：Promise 与 async/await

```js
async function loadNote(id) {
  const res = await fetch(`/api/notes/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();          // 注意：也要 await / return
}

try {
  const note = await loadNote(42);
} catch (err) {
  console.error('加载失败', err);
}

const [a, b] = await Promise.all([loadNote(1), loadNote(2)]); // 并发
```

`fetch` 只在网络层失败时 reject，**404 / 500 不会进 catch**，必须自己检查 `res.ok`。多个请求互不依赖时用 `Promise.all` 并发，别写成串行的 await。

事件循环的心智模型：同步代码先跑完 → 微任务（`Promise.then`、queueMicrotask）清空 → 再取一个宏任务（`setTimeout`、事件回调）。所以 `await` 之后的代码总在本轮同步代码之后执行。

## DOM 与事件

```js
const list = document.querySelector('#list');

list.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  console.log(btn.dataset.action);
});
```

把监听挂在父容器上、用 `closest()` 判断实际点击目标，叫**事件委托**：动态新增的子元素不用重新绑定，监听数量也少得多。事件默认冒泡，`event.stopPropagation()` 能拦住，但别滥用。

修改 DOM 时尽量批量操作（`replaceChildren`、先拼好字符串再一次写入），避免在循环里反复读写 `offsetHeight` 这类会触发同步回流的属性 —— 那是滚动卡顿的常见来源。

## 容易踩的坑

- **`var` 与闭包循环**：`for (var i…)` 里创建的回调共享同一个 `i`，用 `let` 即可。
- **误以为对象是深拷贝**：`{...obj}` 只拷一层，嵌套对象仍是同一份引用。
- **JSON 里的 `undefined` 与函数会被丢掉**，日期会变成字符串，循环引用直接抛错。
- **忘记 `await`**：拿到的是 Promise 而不是数据，`if (res)` 恒为真。
- **在页面切换后残留监听**：SPA（含 View Transitions）里每次重新挂载都要能 `destroy`，否则监听会越积越多。
- **用 `innerHTML` 拼用户输入**：会形成 XSS，文本一律用 `textContent`，或先做转义。

## 参考

依据 [菜鸟教程 · JavaScript 教程](https://www.runoob.com/js/js-tutorial.html) 的知识脉络（语法、数据类型、函数、DOM、事件、异步）整理。本文为要点归纳与自写示例，内置对象清单可查 [JavaScript 参考手册](https://www.runoob.com/jsref/jsref-tutorial.html)。
