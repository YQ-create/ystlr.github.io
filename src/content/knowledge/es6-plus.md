---
title: 'ES6+ 常用语法与模块速查'
description: '解构、展开、可选链、模块导入导出与常用数组/对象写法：日常代码里真正高频的那批语法糖。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['前端', 'JavaScript', 'ES6']
pinned: false
draft: false
---

ES6 之后新增的语法，多数不是为了「写得更短」，而是为了**让意图更显式**：从对象里取什么、有没有值、这个变量从哪个模块来，一眼能看出来。

## 变量、解构与展开

```js
const { title, tags = [], meta: { author } = {} } = note;
const [first, , third] = tags;          // 跳过第二项
const merged = { ...defaults, ...userOptions };  // 后者覆盖前者
const all = [...head, ...tail];

function label({ title, id }, ...rest) {
  return `${id}: ${title} (${rest.length} 个额外参数)`;
}
```

| 写法 | 作用 | 注意 |
| --- | --- | --- |
| `const` / `let` | 块级作用域 | 优先 `const`，需要重新赋值才用 `let` |
| 对象解构 | 按名取值 | 用 `: 新名` 重命名，`= 默认值` 只对 `undefined` 生效 |
| 数组解构 | 按位取值 | 逗号留空可跳位 |
| `...` 展开 | 复制/合并数组与对象 | **浅拷贝**，嵌套对象仍是同一份引用 |
| 剩余参数 | 收集多余实参 | 只能放参数最后一位 |
| 模板字符串 | `` `Hi ${name}` `` | 多行文本不用再拼 `\n` |

默认值只在值为 `undefined` 时触发，`null`、`0`、`''` 都会原样保留 —— 这既是便利也是常见误判来源。

## 可选链、空值合并与判断

```js
const city = user?.address?.city ?? '未知';
const count = response.count ?? 0;   // 0 会被保留
const bad = response.count || 0;     // 0 被误当成「没有值」

// 可选调用与可选索引
onSave?.();
const item = list?.[0];
```

| 运算符 | 含义 | 与 `||` 的区别 |
| --- | --- | --- |
| `?.` | 左侧为 `null` / `undefined` 时短路 | — |
| `??` | 只在 `null` / `undefined` 时取右侧 | `||` 会把 `0`、`''`、`false` 也判为假 |
| `??=` | 仅在为空时赋值 | 适合初始化缓存 |
| `&&` / `\|\|` | 逻辑短路 | 别拿它做「有值才赋值」的判断 |

## 模块：导入与导出

```js
// math.js
export const PI = 3.14;
export function add(a, b) { return a + b; }
export default function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

// app.js
import clamp, { PI, add as plus } from './math.js';
import * as math from './math.js';
```

| 形式 | 说明 |
| --- | --- |
| 具名导出 `export const x` | 可有多个，导入名必须对应（可用 `as` 改） |
| 默认导出 `export default` | 每个模块一个，导入时可任意命名 |
| `import * as ns` | 命名空间整体导入 |
| 动态 `import()` | 返回 Promise，用于按需加载 / 代码分割 |
| 顶层 `await` | 仅在 ESM 中可用，会阻塞该模块及依赖它的模块求值 |

ESM 是**静态、实时绑定**：导入拿到的是活引用而不是值的快照，且 `import` 只能出现在模块顶层。CommonJS 的 `require` 是运行时调用，两者混用前先确认项目的 `type` 字段与打包器行为。

## 常用数组与对象方法

```js
const titles = notes.filter(n => !n.draft).map(n => n.title);
const byId = Object.fromEntries(notes.map(n => [n.id, n]));
const hasDraft = notes.some(n => n.draft);
const total = notes.reduce((sum, n) => sum + n.views, 0);

// 去重：Set 只对原始值或同一引用生效
const uniqueTags = [...new Set(notes.flatMap(n => n.tags))];
```

`map` / `filter` / `reduce` 返回新结构，`forEach` 返回 `undefined`；想在链式调用里继续接方法，就别从 `forEach` 开始。

## 容易踩的坑

- **`...` 当成深拷贝**：改了 `merged.meta.x`，原对象的 `meta` 也跟着变。嵌套结构要单独处理或用结构化克隆。
- **`??` 与 `||` 混用**：计数、开关、空字符串被 `||` 吞掉，是后台配置类 bug 的高发区。
- **解构嵌套没给中间层默认值**：`{ meta: { author } }` 在 `meta` 缺失时直接抛错，写成 `meta: { author } = {}`。
- **`import` 写进条件分支**：静态导入必须顶层；按需加载要用 `await import()`。
- **循环里 `await` 串行执行**：本可并发的请求被写成逐个等待，用 `Promise.all` 合并。
- **在 CommonJS 项目里直接用 ESM 写法**：Node 会按 `package.json` 的 `type` 解析 `.js`，报错信息常常指向完全不相干的一行。
- **用 `for...in` 遍历数组**：会带上原型链上的可枚举属性，数组请用 `for...of` 或数组方法。
- **`Object.fromEntries` 遇到重复键**：后面的值静默覆盖前面的，去重前先确认键唯一。

## 参考

依据 [菜鸟教程 · JavaScript 教程](https://www.runoob.com/js/js-tutorial.html) 的知识脉络整理，模块与解构部分参照 [MDN · JavaScript 模块](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules) 和 [MDN · 解构赋值](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment)。本文为要点归纳与自写示例。
