---
title: 'SQLite 入门与常用 SQL 速查'
description: '单文件数据库适合放在哪、类型与约束有什么特别，以及和 MySQL 写法差异最大的几处。'
pubDate: 2026-11-09
category: '数据与存储'
tags: ['数据库', 'SQLite', '速查']
pinned: false
draft: false
---

SQLite 不是「简化版 MySQL」，而是**嵌入式、零服务、单文件**的数据库：它跑在应用进程里，没有账号体系、没有网络连接、没有独立守护进程。这个定位决定了它适合本地工具、桌面/移动应用、测试与小规模站点，不适合高并发写入的多机服务。

## 类型系统：动态类型

| 声明类型 | 实际亲和性 | 存进去的值 |
| --- | --- | --- |
| `INT` / `INTEGER` | INTEGER | 整数，含 `INTEGER PRIMARY KEY` 作 rowid 别名 |
| `TEXT` / `VARCHAR(n)` | TEXT | 字符串，`VARCHAR(20)` 的 20 **不强制** |
| `REAL` / `DOUBLE` | REAL | 浮点 |
| `BLOB` / 不写类型 | BLOB / NUMERIC | 原样存储 |

SQLite 采用**类型亲和**而非严格约束：往 `INTEGER` 列里塞字符串通常也能成功。`STRICT` 表（较新版本支持）可以改成严格校验。另外布尔没有原生类型，用 `0` / `1`；日期也没有专用类型，常用 ISO 字符串或整数时间戳。

```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT '未分类',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (title, category)
);

INSERT INTO notes (title, category) VALUES ('HTTP 缓存', 'Web 原理')
  ON CONFLICT(title, category) DO UPDATE SET views = views + 1;

SELECT title, views FROM notes WHERE views >= 10 ORDER BY views DESC LIMIT 20;
```

## 与 MySQL 写法差异最大的几处

| 事情 | SQLite | MySQL |
| --- | --- | --- |
| 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `AUTO_INCREMENT` |
| 时间 | `datetime('now')`、`strftime('%Y-%m-%d', ...)` | `NOW()`、`DATE_FORMAT()` |
| 字符串拼接 | `\|\|` | `CONCAT()` |
| 建库 | 没有 `CREATE DATABASE`，一个文件就是一个库 | `CREATE DATABASE` |
| 用户与权限 | 无，靠文件权限 | `GRANT` / 账号体系 |
| 类型长度 | 不强制 | 一般强制 |
| `ALTER` | 能力有限，复杂改动常要重建表 | 较完整 |

```sql
-- upsert（3.24+）：冲突时更新而不是报错
INSERT INTO kv (key, value) VALUES ('theme', 'dark')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- 时间函数随便算
SELECT date('now', '-7 days') AS week_ago,
       strftime('%Y-%m', created_at) AS month FROM notes;
```

## 事务与并发

```sql
BEGIN IMMEDIATE;   -- 立刻拿写锁，避免「读到旧值再写」的竞态
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

SQLite 是**库级写锁**：同一时刻只能有一个写事务，读可以并发（开启 WAL 后读写也能并存）。写密集场景下把多条语句包进一个事务非常关键 —— 不显式开事务时每条 `INSERT` 都要单独落盘，几千条能慢上百倍。

```bash
sqlite3 app.db ".backup backup.db"     # 在线备份，别直接 cp 正在写的 db 文件
sqlite3 app.db "PRAGMA journal_mode=WAL;"
sqlite3 app.db "PRAGMA foreign_keys=ON;"
```

## 容易踩的坑

- **外键默认不生效**：每个连接都要 `PRAGMA foreign_keys=ON`，否则约束写了等于没写。
- **以为 `VARCHAR(20)` 会截断**：不强制长度，超长字符串照样存进去。
- **拿它扛高并发写入**：库级写锁会让写请求排队，报 `database is locked`；该换客户端/服务端数据库。
- **不显式开事务批量插入**：每条语句一次 fsync，速度差异是数量级的。
- **直接复制正在写入的 `.db` 文件**：可能拷到不一致状态，用 `.backup` 或先停写。
- **多个进程跨网络文件系统访问**：文件锁在 NFS / 部分网盘上不可靠，容易损坏数据。
- **用 `AUTOINCREMENT` 当默认**：多数场景 `INTEGER PRIMARY KEY` 就够，前者额外维护一张表且不能复用已删 ID。
- **忘了 `NOT NULL` 与默认值**：类型亲和很宽松，脏数据会悄悄进来，约束要在建表时补全。

## 参考

依据 [菜鸟教程 · SQLite 教程](https://www.runoob.com/sqlite/sqlite-tutorial.html) 的知识脉络（类型、建表、常用语句）整理。本文为要点归纳与自写示例，窗口函数等进阶语法见本知识库的《SQL 进阶：子查询、CTE 与窗口函数》。
