---
title: 'Node.js 模块、事件循环与流速查'
description: 'CommonJS 与 ESM、异步任务的执行顺序、Stream 与 Buffer：服务端 JS 的几个地基概念。'
pubDate: 2026-11-09
category: '后端运行时'
tags: ['核心', '运行时']
pinned: false
draft: false
---

Node.js 是**单线程事件循环 + 非阻塞 I/O**：JS 代码在一条线程上跑，耗时的 I/O 交给系统底层，完成后把回调排回队列。所以「不阻塞」是它的第一原则，一条同步的大循环能让整个服务停摆。

## 模块系统

```js
// ESM（package.json 里 "type": "module"，或 .mjs）
import { readFile } from 'node:fs/promises';
import config from './config.js';
export const name = 'app';
export default function start() {}

// CommonJS（.cjs 或未声明 type 时）
const fs = require('node:fs');
module.exports = { start };
```

| | ESM | CommonJS |
| --- | --- | --- |
| 加载 | 静态、编译期确定 | 运行时 `require` |
| 顶层 `await` | 支持 | 不支持 |
| `import.meta.url` | 可用 | 用 `__filename` / `__dirname` |
| 缓存 | 按 URL 缓存模块 | 按解析后的文件路径缓存 |
| 混用 | `import` 可引 CJS；CJS `require` 不了顶层 await 的 ESM | — |

`node:` 前缀显式声明内置模块（`node:fs`、`node:path`），能避免被同名 npm 包顶替。模块只会在**首次加载时执行一次**，之后拿到的是缓存的导出 —— 顶层带副作用的初始化也因此只跑一次。

## 事件循环：谁先谁后

```js
setTimeout(() => console.log('timer'), 0);
Promise.resolve().then(() => console.log('micro'));
process.nextTick(() => console.log('tick'));
console.log('sync');
// sync → tick → micro → timer
```

| 队列 | 包含 | 时机 |
| --- | --- | --- |
| 同步栈 | 当前正在执行的代码 | 最先 |
| `process.nextTick` | Node 特有 | 当前操作结束后、微任务之前 |
| 微任务 | `Promise.then` / `queueMicrotask` / `await` 之后 | 每个宏任务结束后清空 |
| 宏任务 | `setTimeout`、`setInterval`、I/O 回调 | 按事件循环阶段轮转 |

`setTimeout(fn, 0)` 不是「立刻」，最早也要等下一轮 timers 阶段。别用同步忙等或 `sleep` 去「等异步」，会直接堵住循环。

```js
// ✅ 并发发起，总耗时约等于最慢的那个
const [user, posts] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
]);

// ❌ 逐个 await，耗时相加
const u = await fetchUser(id);
const p = await fetchPosts(id);
```

## Stream、Buffer 与常用内置模块

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

// 流式拷贝：内存占用与文件大小无关
await pipeline(
  createReadStream('big.log'),
  createGzip(),
  createWriteStream('big.log.gz'),
);
```

| 概念 | 说明 |
| --- | --- |
| `Buffer` | 固定长度的二进制字节，处理文件/网络原始数据 |
| `Readable` / `Writable` | 可读流 / 可写流 |
| `pipeline()` | 串接流并正确传播错误与销毁（比 `.pipe()` 稳） |
| `node:path` | 拼路径，用 `join` / `resolve`，别手工拼 `/` |
| `node:events` | `EventEmitter`，发布订阅与错误事件 |
| `node:worker_threads` | CPU 密集任务另开线程，别堵事件循环 |

**大文件一律用流**：`readFileSync` 把整个文件读进内存，几百 MB 的日志会直接把进程撑爆。

## 容易踩的坑

- **在请求处理里写同步阻塞**：`readFileSync`、大 JSON 解析、密集循环会让所有请求一起排队。
- **混用 ESM / CJS 不看清 `type`**：`require is not defined` 或 `Cannot use import statement outside a module`，先查 `package.json` 与扩展名。
- **串行 `await` 本可并发的请求**：接口延迟叠加，用 `Promise.all`；但要留意并发上限与限流。
- **用 `.pipe()` 不处理错误**：上游出错时下游不会被销毁，可能留下句柄和半截文件，用 `pipeline()`。
- **忘记 `await` 或没 catch**：未处理的 Promise rejection 在新版本默认让进程退出。
- **把 `__dirname` 用在 ESM 里**：改用 `fileURLToPath(import.meta.url)`。
- **依赖模块顶层副作用**：模块缓存意味着初始化只跑一次，测试里改环境变量可能不生效。
- **用 `process.env` 存密钥却打进日志**：配置对象整份打印时容易连 Token 一起输出。
- **忽略 `uncaughtException` 之外还要处理 `unhandledRejection`**：两处都要有日志与优雅退出策略。

## 参考

依据 [菜鸟教程 · Node.js 教程](https://www.runoob.com/nodejs/nodejs-tutorial.html) 与 [Node.js 文档 · Modules](https://nodejs.org/docs/latest/api/modules.html) 的知识脉络整理。本文为要点归纳与自写示例，依赖版本管理见本知识库的《package.json 与依赖版本速查》。
