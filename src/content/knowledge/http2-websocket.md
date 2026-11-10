---
title: 'HTTP/2、HTTP/3 与实时通信速查'
description: '多路复用、队头阻塞、SSE 与 WebSocket：从「一条连接能同时做多少事」理解协议演进。'
pubDate: 2026-11-09
category: 'Web 原理'
tags: ['进阶', '网络']
pinned: false
draft: false
---

HTTP 版本演进的主线是**让一条连接同时承载更多请求，并减少往返**。搞懂「队头阻塞发生在哪一层」，就能明白为什么有了 HTTP/2 还需要 HTTP/3，以及什么时候该用 WebSocket。

## 三代协议对照

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| 连接 | 每域名多个 TCP 连接 | 一条 TCP 连接多路复用 | 基于 QUIC（UDP） |
| 并发 | 有限，靠开多连接 | 多个 stream 并行 | 多个 stream 并行 |
| 头部 | 纯文本、重复传输 | HPACK 压缩 + 二进制帧 | QPACK 压缩 |
| 队头阻塞 | 有（请求级） | TCP 层仍有 | 基本消除（丢包只影响对应 stream） |
| 建连 | TCP + TLS 多次往返 | TCP + TLS | 握手与加密合并，0/1-RTT |

HTTP/2 解决了**应用层**的队头阻塞：请求被拆成带 stream id 的帧交错发送，不必等前一个响应回来。但底层仍是一条 TCP，一旦某个包丢了，TCP 会卡住后面所有数据 —— 这叫**传输层队头阻塞**，HTTP/3 换到 QUIC/UDP 才绕开。

## 演进带来的实践变化

| 旧做法（HTTP/1.1 时代） | 现在 |
| --- | --- |
| 把资源分散到多个域名突破并发上限 | 反而是负担：多一次 DNS + 连接 + TLS |
| 合并雪碧图、把 JS/CSS 打成一个大包 | 按入口/路由拆分更利于缓存与按需加载 |
| 内联大量小资源省请求 | 收益变小，还会牺牲缓存 |
| 依赖 `Connection: keep-alive` 调优 | 连接复用由协议本身处理 |

注意：HTTPS 下 HTTP/2 / HTTP/3 由服务端与 CDN 决定是否启用，前端代码不用改；`curl -I` 或 Network 面板的 Protocol 列能看到实际用的版本。

## 实时通信怎么选

| 方案 | 方向 | 适合 | 特点 |
| --- | --- | --- | --- |
| 轮询 | 客户端反复问 | 兼容兜底 | 浪费请求、有延迟 |
| SSE (`EventSource`) | 服务端 → 客户端 | 通知、进度、日志流 | 基于普通 HTTP，自动重连，只能单向 |
| WebSocket | 双向 | 聊天、协同、实时对战 | 一次升级握手后全双工，需自己管心跳与重连 |
| WebRTC | 点对点 | 音视频 | 另有一套信令与 NAT 穿透 |

```js
// SSE：服务端持续推 text/event-stream，浏览器自动处理重连
const stream = new EventSource('/api/events');
stream.addEventListener('progress', (e) => {
  console.log(JSON.parse(e.data));
});

// WebSocket：双向，注意错误与关闭后的重连
const ws = new WebSocket('wss://example.com/ws');
ws.addEventListener('message', (e) => console.log(JSON.parse(e.data)));
ws.addEventListener('close', () => scheduleReconnect());
```

**能用普通 HTTP 就别上 WebSocket**：SSE 在单向推送场景里更简单，走现有 HTTP 基础设施（代理、压缩、鉴权），还能自动重连。WebSocket 需要额外处理心跳、断线重连、消息顺序与背压。

## 容易踩的坑

- **以为 HTTP/2 就一定更快**：高丢包网络下 TCP 层队头阻塞可能让多个并行 stream 一起慢下来。
- **继续搞域名分片**：为一个域名多付一次 DNS + 握手，还用不上多路复用的好处。
- **把 WebSocket 当普通请求用**：它不自带状态码、缓存、重试语义，错误处理和鉴权都要自己实现。
- **忘了心跳与重连**：移动网络切换、代理超时会静默断链，页面看起来还「在线」却收不到消息。
- **SSE 想往服务端发数据**：它是单向的，写操作仍要另外发 `fetch`。
- **升级接口漏掉反向代理配置**：WebSocket 需要 `Upgrade` / `Connection` 头透传，Nginx 等代理要显式配置。
- **用 `wss://` 却被 CSP 拦**：`connect-src` 要放行对应地址。
- **把所有资源塞进一个巨大 bundle**：HTTP/2 不怕多请求，但浏览器仍要解析执行整个包，首屏照样慢。

## 参考

依据 [MDN · HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP) 与 [MDN · WebSocket API](https://developer.mozilla.org/zh-CN/docs/Web/API/WebSockets_API) 的知识脉络整理。本文为要点归纳与自写示例，方法、状态码与缓存头的基础部分见本知识库的《HTTP 方法、状态码与缓存速查》。
