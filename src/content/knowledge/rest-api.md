---
title: 'REST API 设计与错误响应速查'
description: '资源命名、方法语义、状态码与错误体格式：让接口不用读文档也能猜对大半。'
pubDate: 2026-11-09
category: '后端运行时'
tags: ['API', '后端', 'HTTP']
pinned: false
draft: false
---

REST 的重点不在「用了 HTTP」，而在**把 URL 当资源名、把方法当动作**。接口一旦做到「看路径知道操作对象、看方法知道做什么、看状态码知道结果」，联调成本会低很多。

## 资源与方法

| 方法 | 语义 | 幂等 | 例子 |
| --- | --- | --- | --- |
| `GET` | 读取 | 是 | `GET /notes`、`GET /notes/12` |
| `POST` | 创建 / 触发动作 | 否 | `POST /notes` |
| `PUT` | 整体替换（ID 由客户端给） | 是 | `PUT /notes/12` |
| `PATCH` | 局部修改 | 通常否 | `PATCH /notes/12` |
| `DELETE` | 删除 | 是 | `DELETE /notes/12` |

```http
GET    /api/notes?tag=前端&page=2&limit=20
POST   /api/notes            → 201 Created + Location: /api/notes/12
GET    /api/notes/12         → 200 或 404
PATCH  /api/notes/12         → 200（带更新后的资源）
DELETE /api/notes/12         → 204 No Content
```

命名约定：

- 路径用**复数名词**表示集合，不要在路径里塞动词（`/getNote?id=12` 改成 `GET /notes/12`）。
- 层级表达归属：`/users/7/posts`；层级别超过两三层，太深时用查询参数。
- 确实不是 CRUD 的动作（如「重新发送」「发布」）可以用 `POST /notes/12/publish`，但要先确认不能用状态字段的 `PATCH` 表达。
- 筛选、排序、分页放查询参数：`?sort=-createdAt&page=2&limit=20`，别为每种组合造一条路径。

## 状态码怎么给

| 码 | 用在 | 别用在 |
| --- | --- | --- |
| `200` | 成功且有响应体 | 创建成功 |
| `201` | 创建成功，带 `Location` | 更新 |
| `204` | 成功但无响应体（删除） | 还要返回数据的场景 |
| `400` | 参数/格式错误 | 业务规则冲突 |
| `401` | 未认证 | 已登录但没权限 |
| `403` | 无权限 | 没登录 |
| `404` | 资源不存在 | 权限隐藏（有时刻意用 404） |
| `409` | 状态冲突（重复、版本不一致） | 普通参数错误 |
| `422` | 语义校验不通过 | 语法错误 |
| `429` | 限流 | 服务端故障 |
| `5xx` | 服务端出错 | 把用户输入错误包装成服务端错 |

**别把所有失败都塞进 `200` + 自定义 `code`**：客户端得先解析响应体才知道成败，缓存、重试、监控也全都失效了。HTTP 状态码负责「传输层结果」，业务错误码负责「具体原因」，两层各司其职。

## 错误体与响应结构

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "标题不能为空",
    "details": [{ "field": "title", "reason": "required" }],
    "requestId": "req_8f3c2"
  }
}
```

| 字段 | 作用 |
| --- | --- |
| `code` | 稳定、机器可判断的错误类型 |
| `message` | 给人看的说明（**别把堆栈、SQL 原样返回**） |
| `details` | 逐字段的校验信息，方便表单直接标红 |
| `requestId` | 串起日志，报障时最有用 |

分页响应统一形状比各写各的更重要：

```json
{ "items": [], "page": 2, "limit": 20, "total": 137 }
```

## 版本、幂等与限流

- 版本放在路径（`/api/v1/notes`）或 `Accept` 头，选一种并写进文档；破坏性变更才升版本。
- 非幂等的创建接口用**幂等键**（`Idempotency-Key` 头），网络重试时不会重复下单/重复扣款。
- `429` 配 `Retry-After`；列表接口给 `Link` 或游标，别让客户端靠 `offset` 翻到很深。
- 用 `ETag` / `Last-Modified` 做协商缓存，配合 `If-None-Match` 返回 `304`。

## 容易踩的坑

- **用 `GET` 做写操作**：会被缓存、预取、爬虫触发，`DELETE /notes/12` 写成 `GET /notes/delete?id=12` 尤其危险。
- **401 与 403 混用**：前端因此走了错误的引导（跳登录 vs 提示无权限）。
- **错误时返回 `200`**：监控看不到失败率，客户端也容易漏处理。
- **把内部异常文本原样回给客户端**：堆栈、表名、依赖版本都是信息泄露。
- **`POST` 成功不返回 `Location` / 新资源**：客户端只能再猜一次 ID 或重新拉列表。
- **分页只给 `offset`**：数据插入时翻页会重复/漏项，深分页还慢；稳定排序 + 游标更可靠。
- **不校验 `Content-Type`**：按 JSON 解析表单数据，或后端返回 JSON 却没设头。
- **路径里塞动词、大小写混用**：`/getUserInfo` 与 `/users/info` 并存，路由和文档都难维护。
- **忽略 `OPTIONS` 预检**：跨域接口只在浏览器里失败，Postman/curl 却一切正常。

## 参考

依据 [MDN · HTTP 请求方法](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Methods) 与 [MDN · HTTP 响应状态码](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status) 的知识脉络整理。本文为要点归纳与自写示例；请求头、缓存与 CORS 的细节见本知识库的《HTTP 方法、状态码与缓存速查》《同源策略、CORS 与常见 Web 安全速查》。
