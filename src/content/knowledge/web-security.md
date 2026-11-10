---
title: '同源策略、CORS 与常见 Web 安全速查'
description: '浏览器凭什么拦住跨域请求，CORS 响应头怎么配，以及 XSS / CSRF / 点击劫持各自的防线。'
pubDate: 2026-11-09
category: 'Web 原理'
tags: ['实战', '网络']
pinned: false
draft: false
---

浏览器安全模型的地基是**同源策略**：不是「不让请求发出去」，而是「不让 A 源读到 B 源的响应」。很多跨域问题的根因，是把这条读权限规则和「网络连通性」混为一谈。

## 同源怎么判定

协议、主机名、端口三者完全一致才算同源。

| 当前页面 | 目标 | 是否同源 | 原因 |
| --- | --- | --- | --- |
| `https://a.com/x` | `https://a.com/y` | 是 | 路径不参与判定 |
| `https://a.com` | `http://a.com` | 否 | 协议不同 |
| `https://a.com` | `https://api.a.com` | 否 | 主机名不同（子域也算） |
| `https://a.com` | `https://a.com:8443` | 否 | 端口不同 |

注意：`<img>`、`<script>`、`<link>` 这类标签**可以**加载跨源资源，但脚本读不到其内容；用 `fetch` 读取则受同源策略约束。

## CORS：服务端点头才算数

跨域请求能不能读到响应，由**服务端响应头**决定，前端改不出一个「绕过跨域」的开关。

| 响应头 | 作用 |
| --- | --- |
| `Access-Control-Allow-Origin` | 允许哪个源读取；`*` 不能与携带凭据共存 |
| `Access-Control-Allow-Methods` | 预检里声明允许的方法 |
| `Access-Control-Allow-Headers` | 预检里声明允许的自定义头 |
| `Access-Control-Allow-Credentials` | 是否允许携带 Cookie |
| `Access-Control-Max-Age` | 预检结果缓存多久，减少 `OPTIONS` 次数 |
| `Vary: Origin` | 按源返回不同值时，避免缓存串给别的源 |

```http
# 触发预检：自定义头 + application/json + PUT，先问一句
OPTIONS /api/notes/12 HTTP/1.1
Origin: https://a.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type, x-trace-id

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://a.com
Access-Control-Allow-Methods: GET, PUT, DELETE
Access-Control-Allow-Headers: content-type, x-trace-id
Access-Control-Allow-Credentials: true
Vary: Origin
```

「简单请求」（`GET` / `HEAD` / `POST` 且只用少数标准头与内容类型）不发预检，直接带上 `Origin` 发出；**请求照样到了服务端**，只是浏览器按响应头决定要不要把结果交给 JS。所以 `POST` 的跨域写操作仍需要服务端自己做 CSRF 防护。

## 三类高频攻击与防线

| 风险 | 发生的条件 | 主要防线 |
| --- | --- | --- |
| XSS | 用户输入被当成 HTML / 脚本执行 | 输出编码、不要 `innerHTML` 拼不可信内容、CSP、Cookie 加 `HttpOnly` |
| CSRF | 浏览器自动带上 Cookie，替用户发出「本人操作」 | CSRF Token、SameSite Cookie、校验 `Origin` / `Referer`、写操作不用 `GET` |
| 点击劫持 | 页面被透明 iframe 套住诱导点击 | `frame-ancestors`（CSP）或 `X-Frame-Options` |
| 敏感信息泄露 | 令牌存在可被脚本读到的地方 | 避免把长期令牌放 `localStorage`，缩短有效期 |

```http
Content-Security-Policy: default-src 'self'; img-src 'self' https:; frame-ancestors 'none'
Set-Cookie: sid=abc123; HttpOnly; Secure; SameSite=Lax; Path=/
```

`SameSite=Lax` 能挡住大多数跨站表单与图片触发的写请求，但**同源子域之间**仍要按信任边界处理；`HttpOnly` 让脚本读不到 Cookie，能显著抬高 XSS 的代价。

## 容易踩的坑

- **前端加 `mode: 'no-cors'` 以为解决了跨域**：拿到的只是不可读的 opaque 响应，问题被藏起来而不是被解决。
- **`Allow-Origin: *` 同时开 `Allow-Credentials: true`**：浏览器直接拒绝，凭据请求必须回显具体 `Origin`。
- **回显任意 `Origin` 却不校验白名单**：等于给所有站点发了通行证，比 `*` 更危险。
- **忘了 `Vary: Origin`**：CDN 把针对 A 源的响应缓存后发给 B 源，出现「有时能用有时不能」。
- **只转义 `<script>` 标签**：`onerror`、`javascript:`、SVG、富文本属性都是注入面，按输出位置做编码。
- **把 CSP 一次配到最严就直接上线**：先用 `Content-Security-Policy-Report-Only` 观察违规，再逐步收紧。
- **用 `GET` 做写操作**：会被预取、缓存、跨站标签触发，也更容易被 CSRF 利用。
- **认为「内网接口不用鉴权」**：浏览器的请求同样能打到内网地址，服务端必须自己校验身份与来源。

## 参考

依据 [MDN · 同源策略](https://developer.mozilla.org/zh-CN/docs/Web/Security/Same-origin_policy)、[MDN · CORS](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS)、[MDN · CSP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Security-Policy) 与 [OWASP · XSS](https://owasp.org/www-community/attacks/xss/)、[OWASP · CSRF](https://owasp.org/www-community/attacks/csrf) 的知识脉络整理。本文为要点归纳与自写示例，实际配置以所用浏览器与服务端框架的文档为准。
