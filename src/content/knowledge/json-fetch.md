---
title: 'JSON 语法与 fetch 请求速查'
description: '数据交换格式与浏览器发请求的现代写法，含错误处理和常见序列化陷阱。'
pubDate: 2026-11-05
category: 'Web 原理'
tags: ['入门', '网络']
pinned: false
draft: false
---

JSON 是前后端之间最通用的数据格式，`fetch` 是浏览器发起请求的标准方式。两者配合时，问题大多出在「序列化丢了东西」和「错误处理只写了一半」。

## JSON 的六条规则

```json
{
  "title": "第一条笔记",
  "year": 2026,
  "published": true,
  "tags": ["Web", "速查"],
  "author": null,
  "extra": { "words": 820 }
}
```

1. 数据以**键值对**或**数组**组织；
2. 键必须用**双引号**包起来（单引号不合法）；
3. 字符串也只能用双引号；
4. 允许的值只有：字符串、数字、布尔、`null`、对象、数组；
5. **不能有尾随逗号**，不能写注释；
6. 数字不区分整数小数，没有 `NaN` / `Infinity` / `undefined`。

`JSON.stringify()` 会自动丢掉对象里的 `undefined`、函数和 `symbol` 属性；遇到 `Date` 会转成 ISO 字符串，遇到循环引用会直接抛错。反向的 `JSON.parse()` 遇到格式错误会抛异常，解析外部数据时应该放进 `try/catch`。

```js
JSON.stringify({ a: undefined, d: new Date('2026-11-09') });
// '{"d":"2026-11-09T00:00:00.000Z"}' —— a 被丢掉了
```

## fetch 的标准写法

```js
async function request(url, options = {}) {
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const note = await request('/api/notes/1');
await request('/api/notes', { method: 'POST', body: { title: '新笔记' } });
```

几个要点：

- **`res.ok` 必须自己查**：`fetch` 只在网络故障、超时或跨域被拦时 reject，404/500 会正常 resolve。
- **`body` 要序列化**：传对象给 `body` 会变成字符串 `[object Object]`。
- **GET 不能带 body**：`Content-Type` 也只在有请求体时才有意义。
- **加超时**：`AbortSignal.timeout(ms)` 或用 `AbortController` 在组件卸载时 `abort()`，避免请求回来后操作已不存在的 DOM。
- **响应体只能读一次**：`res.json()` / `res.text()` 消费后不能重复调用。

## 并发、取消与重试

```js
const controller = new AbortController();

// 并发：互不依赖的请求一起发
const [user, notes] = await Promise.all([
  fetch('/api/user').then((r) => r.json()),
  fetch('/api/notes').then((r) => r.json()),
]);

// 竞态：只保留最后一次输入的结果
controller.abort(); // 组件销毁 / 搜索词变化时调用
```

串行 `await` 会把请求耗时相加；能并发就别排队。搜索框这类高频输入需要做**防抖 + 取消旧请求**，否则先发的慢响应可能覆盖后发的新结果。

重试只对幂等请求（GET / PUT）和临时性失败（`429`、`503`、网络中断）有意义，而且要加退避，别把 400 参数错误也重试三遍。

## 容易踩的坑

- **JSON 里写注释或尾逗号**：配置文件能容忍不代表标准 JSON 能，`JSON.parse` 会直接报错。
- **把 `Date` 当对象传**：到后端是字符串，需要双方约定格式（推荐 ISO 8601 + UTC）。
- **`Content-Type` 与实际体不一致**：明明发的 JSON 却标成表单类型，服务端解析出空对象。
- **忘记处理 204 / 空响应体**：对空字符串调用 `res.json()` 会抛 `SyntaxError`。
- **跨域问题当成前端 bug**：凭据、允许的方法与来源由服务端 CORS 响应头决定，带 Cookie 还要 `credentials: 'include'` 配合 `Access-Control-Allow-Credentials`。
- **把密钥放进前端代码**：任何打包进客户端 JS 的 token 都能被访客读到，需要私密调用就走服务端代理。

## 参考

依据 [菜鸟教程 · JSON 教程](https://www.runoob.com/json/json-tutorial.html) 与 [AJAX 教程](https://www.runoob.com/ajax/ajax-tutorial.html) 的知识脉络整理，并用现代 `fetch` / `async-await` 写法替代了传统的 `XMLHttpRequest` 示例。本文为要点归纳与自写示例。
