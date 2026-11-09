---
title: 'HTML5 浏览器存储与常用 API 速查'
description: 'localStorage、sessionStorage、Cookie 各自适合放什么，以及 History、剪贴板、可见性等浏览器接口怎么配合。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['前端', 'HTML5', '浏览器']
pinned: false
draft: false
---

浏览器端「记住点什么」有四种常见去处，选错通常不是功能坏掉，而是**数据活得太久、或者每次请求都被白白带上**。先定生命周期和容量，再写代码。

## 四种存储怎么选

| 方案 | 生命周期 | 典型容量 | 会随请求发送 | 适合放 |
| --- | --- | --- | --- | --- |
| `localStorage` | 手动清除才消失 | 约 5MB | 否 | 主题、字号、草稿 |
| `sessionStorage` | 标签页关闭即失效 | 约 5MB | 否 | 表单临时状态、分页位置 |
| Cookie | 按 `Expires` / `Max-Age` | 约 4KB | **是**，每个请求都带 | 会话标识等服务端要读的值 |
| IndexedDB | 手动清除 | 较大，按配额 | 否 | 离线数据、结构化缓存 |

判断顺序很简单：**服务端要读吗** → 要，用 Cookie；**关掉标签页还要吗** → 不要，用 `sessionStorage`；**是结构化/大量数据吗** → 是，用 IndexedDB；剩下的用 `localStorage`。

## localStorage 的读写

它只能存字符串，而且同步阻塞主线程。写一层薄封装，把序列化和异常兜住，比在每个组件里直接调要省事得多。

```js
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback; // 隐私模式禁用存储、内容被手动改坏，都不该让页面白屏
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // 配额写满时返回 false，由调用方决定是否降级
    }
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

store.set('editor:draft', { text: '写了一半的正文', savedAt: Date.now() });
const draft = store.get('editor:draft', { text: '' });
```

跨标签页同步可以监听 `storage` 事件：事件在**其他**标签页触发，当前写入的那个页面不会收到。

```js
window.addEventListener('storage', (e) => {
  if (e.key === 'theme') applyTheme(e.newValue);
});
```

## 常用的浏览器接口

| 接口 | 做什么 | 注意 |
| --- | --- | --- |
| `history.pushState()` | 改地址栏而不刷新 | 只改同源路径，要自己处理 `popstate` |
| `navigator.clipboard` | 读写剪贴板 | 需要安全上下文（HTTPS）与用户手势 |
| `IntersectionObserver` | 观察元素是否进入视口 | 图片懒加载、滚动高亮，别再用 scroll 手算 |
| `ResizeObserver` | 观察元素尺寸变化 | 比监听 `window.resize` 更贴近真实布局 |
| `requestAnimationFrame` | 下一帧执行 | 连续动画用它，配合页面隐藏时暂停 |
| `document.visibilityState` | 页面是否可见 | 切到后台时停掉轮询和动画，省电 |
| `URL` / `URLSearchParams` | 解析与拼装地址 | 别手工拼查询串，转义容易漏 |
| `navigator.onLine` | 网络状态提示 | 只能当提示，不能当「请求一定成功」的依据 |

```js
// 用 URLSearchParams 读写查询参数，自动处理转义
const url = new URL(location.href);
url.searchParams.set('tag', '前端基础');
history.pushState(null, '', url);

const tag = new URLSearchParams(location.search).get('tag') ?? '';
```

## 容易踩的坑

- **把敏感信息放进 localStorage**：任意脚本都能读到，XSS 一旦发生就等于令牌泄露。Token 优先考虑 `HttpOnly` Cookie。
- **直接存对象**：`localStorage.setItem('user', obj)` 会变成字符串 `"[object Object]"`，必须先序列化。
- **不捕获异常**：Safari 隐私模式、配额写满、用户禁用存储都会抛错，没兜住就是一个白屏。
- **用 Cookie 存大对象**：Cookie 每次请求都随头部发送，几 KB 的 JSON 会拖慢所有接口。
- **同步读写太频繁**：`localStorage` 是同步 API，滚动回调里反复读写会卡帧；先读到内存，改动时再落盘。
- **忽略同源限制**：`http` 与 `https`、不同端口、不同子域都算不同源，存储互不共享。
- **`pushState` 之后不处理返回**：用户点后退时地址变了，页面内容没跟着变；要监听 `popstate` 重新渲染。
- **剪贴板在非用户手势里调用**：异步回调里再写剪贴板常常被拒绝，尽量在点击处理函数里直接调用。

## 参考

依据 [菜鸟教程 · HTML5 教程](https://www.runoob.com/html/html5-intro.html) 与 [HTML5 Web 存储](https://www.runoob.com/html/html5-webstorage.html) 的知识脉络整理，浏览器接口部分参照 [MDN · Window.localStorage](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/localStorage)。本文为要点归纳与自写示例。
