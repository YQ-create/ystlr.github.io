---
title: 'Nginx 配置与反向代理速查'
description: 'server / location 匹配规则、静态站点与反向代理的最小可用配置，以及改完必做的两件事。'
pubDate: 2026-11-09
category: '工程实践'
tags: ['实战', '工具']
pinned: false
draft: false
---

Nginx 配置读起来像一叠嵌套的盒子：`http` 里放多个 `server`（按域名/端口选），`server` 里放多个 `location`（按 URI 选）。大多数问题最后都能归到「**请求落进了哪个 location**」。

## 配置结构

```nginx
http {
  include       mime.types;
  default_type  application/octet-stream;

  server {
    listen 80;
    server_name example.com www.example.com;

    location / {
      root  /var/www/site;
      index index.html;
      try_files $uri $uri/ /index.html;   # SPA 回退
    }

    location /assets/ {
      expires 30d;
      add_header Cache-Control "public, immutable";
    }
  }
}
```

| 指令 | 作用 |
| --- | --- |
| `listen` / `server_name` | 监听端口与匹配的域名 |
| `root` / `alias` | 文件根目录；`alias` 会替换 location 前缀 |
| `index` | 目录请求默认文件 |
| `try_files` | 按顺序找文件，最后一项可作回退 |
| `expires` / `add_header` | 缓存与响应头 |
| `error_page` | 自定义错误页 |

## location 匹配优先级

| 写法 | 含义 | 优先级 |
| --- | --- | --- |
| `location = /path` | 精确匹配 | 最高，命中即停 |
| `location ^~ /static/` | 前缀匹配，命中后不再看正则 | 高 |
| `location ~ \.php$` | 正则，区分大小写 | 按出现顺序 |
| `location ~* \.(png\|jpg)$` | 正则，忽略大小写 | 按出现顺序 |
| `location /prefix` | 普通前缀 | 取最长者，之后仍可能被正则覆盖 |

```nginx
# 静态资源走长缓存，其余交给后端
location ^~ /_astro/ {
  root /var/www/site;
  expires 1y;
  add_header Cache-Control "public, immutable";
}

location /api/ {
  proxy_pass http://127.0.0.1:3000;   # 末尾不带 / 时保留原 URI
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

`proxy_pass` **末尾有没有斜杠**是经典坑：带 `/` 会把 location 前缀替换掉，不带则原样转发。写错时后端收到的路径会多一段或少一段。

## 常见任务

```nginx
# HTTP → HTTPS
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}

# 单页应用：找不到文件就回退到 index.html
location / { try_files $uri $uri/ /index.html; }

# 纯静态站点：目录请求返回 404 而不是列目录
location / { try_files $uri $uri/ =404; }

# gzip
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
```

改配置后的标准动作永远是这两步：

```bash
nginx -t          # 语法检查，顺便打印用到的配置文件路径
nginx -s reload   # 平滑重载，不中断已有连接
```

## 容易踩的坑

- **改完直接 reload 不 `nginx -t`**：语法错误会让 reload 失败，线上还在跑旧配置，自己却以为生效了。
- **`proxy_pass` 末尾斜杠写错**：`/api/users` 变成 `/users` 或 `/api/api/users`。
- **忘传 `X-Forwarded-Proto`**：后端生成回调地址时误判成 http，登录跳转、重定向链路全乱。
- **用 `if` 做复杂判断**：Nginx 的 `if` 在 location 里行为特殊（「if is evil」），优先用 `try_files` / `map` / 多个 location。
- **给 HTML 也上超长缓存**：发布后用户长期停在旧页面，还引用已被删除的旧资源文件。
- **`alias` 与 `try_files` 混用**：路径拼接结果常常不符合预期，静态目录优先用 `root`。
- **开了目录索引 `autoindex on`**：把整个目录结构公开，非下载站一律关掉。
- **正则 location 写在前面**：先命中正则就跳过更合适的普通前缀，顺序要按优先级排。
- **WebSocket 升级头没透传**：需要 `proxy_http_version 1.1` 与 `Upgrade` / `Connection` 头。

## 参考

依据 [Nginx · Beginner's Guide](https://nginx.org/en/docs/beginners_guide.html) 的知识脉络（配置结构、server / location、静态服务与代理）整理。本文为要点归纳与自写示例；缓存头的含义见本知识库的《HTTP 方法、状态码与缓存速查》。
