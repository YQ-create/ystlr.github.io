---
title: 'Cookie、Session 与 JWT 鉴权速查'
description: '三种「记住你是谁」的方案各自把状态放在哪、怎么失效，以及 Cookie 属性该怎么配。'
pubDate: 2026-11-09
category: 'Web 原理'
tags: ['网络', '鉴权', '安全']
pinned: false
draft: false
---

鉴权的核心问题只有一个：**状态存在哪一端**。存在服务端（Session）好撤销、要查库；签在令牌里（JWT）好横向扩展、难即时作废；Cookie 则是把「凭据」从浏览器带到服务端的通道，不是方案本身。

## 三种方案对照

| | Session + Cookie | JWT | 纯 Cookie 存用户数据 |
| --- | --- | --- | --- |
| 状态在哪 | 服务端（内存 / Redis / 库） | 令牌自身（签名，不加密） | 浏览器（可被篡改） |
| 服务端查库 | 每次要查会话 | 校验签名即可 | 不需要 |
| 即时失效 | 删会话立刻生效 | 需要黑名单 / 短有效期 | 删 Cookie |
| 横向扩展 | 要共享会话存储 | 容易 | — |
| 适合 | 传统 Web 后台、需要强制下线 | 微服务、短期令牌、一次性链接 | **不要用于身份** |

**JWT 的 payload 只是 Base64 编码，不是加密**，放手机号、权限明细前先想清楚它会被谁看到。签名只保证「没被改」，不保证「没被读」。

## Cookie 属性怎么配

```http
Set-Cookie: sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

| 属性 | 作用 | 建议 |
| --- | --- | --- |
| `HttpOnly` | 禁止 JS 读取 | 会话 Cookie 必开，能显著抬高 XSS 的代价 |
| `Secure` | 仅 HTTPS 发送 | 生产必开 |
| `SameSite` | 跨站请求是否携带 | `Lax` 是常用默认；跨站需要携带才用 `None; Secure` |
| `Path` / `Domain` | 发送范围 | 范围尽量收窄，`Domain` 别随便放大到父域 |
| `Max-Age` / `Expires` | 有效期 | 不写就是会话 Cookie，关浏览器即失效 |
| `__Host-` 前缀 | 强制 Secure + Path=/ + 无 Domain | 高敏感 Cookie 可用 |

`SameSite` 判的是「站」不是「源」：`https://a.com` 与 `https://api.a.com` 一般仍算同站，而与 `https://b.com` 才是跨站。它主要挡 CSRF，**不替代**服务端对写操作的校验。

## 一条典型登录链路

```
1. POST /login（账号密码）  → 服务端校验，创建 session，Set-Cookie: sid=…
2. 后续请求浏览器自动带 Cookie → 服务端按 sid 查到用户
3. 退出 /logout            → 删服务端 session + 下发过期 Cookie
4. 关键操作（改密码、支付） → 重新验证身份，不只看 session 是否存在
```

用 JWT 时把第 2 步换成「校验签名与 `exp`」。因为令牌发出去就收不回来，常见做法是**访问令牌短有效期（十几分钟）+ 刷新令牌（可撤销）**，刷新令牌仍存服务端。

```js
// 前端只需要带上凭据，不要自己解析当权限依据
const res = await fetch('/api/me', { credentials: 'include' });
if (!res.ok) throw new Error('未登录或登录已过期');
const me = await res.json();
```

跨源请求要带 Cookie，除了 `credentials: 'include'`，服务端还得回显具体 `Origin` + `Access-Control-Allow-Credentials: true`，不能用 `*`（详见本知识库的《同源策略、CORS 与常见 Web 安全速查》）。

## 容易踩的坑

- **把 JWT 存进 `localStorage`**：XSS 一发生令牌直接被读走；优先 `HttpOnly` Cookie，并接受相应的 CSRF 防护成本。
- **把用户 ID / 角色明文放 Cookie 就信它**：Cookie 是客户端数据，必须服务端签名或查库。
- **JWT 有效期设几天甚至几周**：泄露后无法即时作废，等于长期通行证。
- **只校验签名不看 `exp` / `iss` / `aud`**：过期或被签给别的系统的令牌也会被接受。
- **退出登录只删前端 Cookie**：服务端会话还在，拿到旧 Cookie 仍能访问；两边都要清。
- **`SameSite=None` 忘了加 `Secure`**：现代浏览器会直接拒绝写入该 Cookie。
- **登录前后不轮换会话 ID**：会话固定攻击（Session Fixation）就是靠这个。
- **把 Token 拼进 URL**：会留在历史记录、Referer、日志与代理缓存里。

## 参考

依据 [MDN · HTTP Cookie](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Cookies) 与 [MDN · Set-Cookie](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Set-Cookie) 的知识脉络整理，跨源与 XSS/CSRF 部分参照本知识库的《同源策略、CORS 与常见 Web 安全速查》。本文为要点归纳与自写示例。
