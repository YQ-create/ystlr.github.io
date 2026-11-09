---
title: '表设计：范式、约束与关系速查'
description: '一对多/多对多怎么落表、主键外键怎么选，以及什么时候该故意不遵守范式。'
pubDate: 2026-11-09
category: '数据与存储'
tags: ['数据库', '建模', 'SQL']
pinned: false
draft: false
---

表设计的核心不是「画得多规范」，而是**让难以维护的重复数据变少，同时让常见查询别太绕**。范式给的是减少冗余的方向，实际项目常在「一致性」和「查询成本」之间取舍。

## 三种关系怎么落表

| 关系 | 落表方式 | 例子 |
| --- | --- | --- |
| 一对一 | 外键放从表，并加 `UNIQUE` | `users` ↔ `user_profiles` |
| 一对多 | 外键放「多」的那张表 | `categories` → `notes` |
| 多对多 | 加一张中间表，两列外键组成联合主键 | `notes` ↔ `tags` |

```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

`ON DELETE CASCADE` 会连带删掉关联行，`RESTRICT` 则阻止删除仍被引用的记录。**别默认全用 CASCADE**：删一个标签却顺手删掉一堆关联，往往不是想要的语义。

## 约束：把规则交给数据库

| 约束 | 保证什么 |
| --- | --- |
| `PRIMARY KEY` | 唯一且非空，一行一个身份 |
| `UNIQUE` | 列/列组合不重复（可允许多个 NULL，视数据库而定） |
| `NOT NULL` | 必须有值 |
| `DEFAULT` | 没给值时的兜底 |
| `CHECK` | 自定义条件，如 `CHECK (views >= 0)` |
| `FOREIGN KEY` | 引用必须存在（注意 SQLite 默认关闭） |

业务规则能写进约束就写进约束：应用层校验会被绕过（脚本、迁移、另一个服务），数据库约束是最后一道防线。

## 前三范式速记

| 范式 | 要求 | 反例 |
| --- | --- | --- |
| 1NF | 字段原子、无重复组 | `tags` 列存 `"前端,工具"` 逗号串 |
| 2NF | 非主属性完全依赖整个联合主键 | 在 `note_tags` 里冗余存 `note_title` |
| 3NF | 非主属性不依赖其他非主属性 | 存了 `category_id` 又存 `category_name` |

判断口诀：**一个事实只在一个地方存一份**。冗余一旦出现，更新就要同时改多处，漏一处数据就不一致了。

## 什么时候故意反范式

| 做法 | 换来什么 | 代价 |
| --- | --- | --- |
| 冗余存 `comment_count` | 列表页不用每次 `COUNT(*)` | 增删评论要同步维护 |
| 存快照（下单时的商品名/价格） | 历史记录不被后续改名影响 | 数据会「故意」和当前值不同 |
| 预聚合报表表 | 复杂统计秒级返回 | 需要定时任务刷新 |
| 宽表 / JSON 列 | 少 JOIN、灵活字段 | 难以索引、难以约束 |

关键是区分**「派生的冗余」**（可以重算，必须写明由谁维护）和**「历史快照」**（本就不该跟着变）。前者要有触发器、事务或任务保证一致，后者不该被「同步」掉。

## 主键与索引的取舍

- 主键选**稳定、无业务含义**的代理键（自增整数 / UUID），别用邮箱、手机号这类会变的值。
- 外键列几乎总要建索引：JOIN 与 `ON DELETE` 检查都靠它，否则会全表扫。
- 区分度太低的列（如只有两值的 `status`）单独建索引收益有限，放进复合索引更划算。
- 命名统一（`snake_case`、单数或复数二选一）比「每张表都最优」更利于长期维护。

## 容易踩的坑

- **用逗号串存多值**：无法按单个值索引、无法保证唯一，查询只能 `LIKE`；改中间表。
- **拿业务字段当主键**：用户改邮箱后所有引用它的表都要跟着改。
- **不给外键列建索引**：JOIN 变慢，删除父记录时的引用检查也会全表扫。
- **滥删级联**：`CASCADE` 沿着关系链一路删下去，一条 `DELETE` 可能清空半库。
- **该存快照却存外键**：商品价格改了，历史订单金额跟着「变」。
- **字段全塞进一个 JSON 大列**：写入方便，之后要按内部字段筛选、加约束时全都很痛。
- **迁移时没想清 NULL 语义**：`NULL` 表示「未知」还是「不适用」不明确，后续 `NOT NULL` 改造会卡住。
- **时间不统一时区**：有的列存本地时间、有的存 UTC，跨时区排序和统计悄悄出错。

## 参考

依据 [菜鸟教程 · MySQL 教程](https://www.runoob.com/mysql/mysql-tutorial.html) 的知识脉络（建表、约束、表关系）整理。本文为要点归纳与自写示例，索引与事务细节见本知识库的《MySQL 索引与事务速查》。
