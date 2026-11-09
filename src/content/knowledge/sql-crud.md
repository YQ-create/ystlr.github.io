---
title: 'SQL 增删改查与连接查询速查'
description: 'SELECT / WHERE / JOIN / GROUP BY 的执行顺序，以及写 UPDATE 前该养成的习惯。'
pubDate: 2026-11-04
category: '数据与存储'
tags: ['数据库', 'SQL', '速查']
pinned: false
draft: false
---

SQL 是声明式语言：你描述「想要什么结果」，而不是「怎么一步步取」。理解这一点，就能理解为什么子句的**书写顺序**和**执行顺序**不一样。

## 四类语句

```sql
-- 查
SELECT id, title, category FROM notes WHERE draft = 0 ORDER BY pub_date DESC LIMIT 10;

-- 增
INSERT INTO notes (title, category, pub_date)
VALUES ('第一条笔记', '前端', '2026-11-09');

-- 改
UPDATE notes SET category = '前端基础' WHERE id = 1;

-- 删
DELETE FROM notes WHERE id = 1;
```

`UPDATE` 和 `DELETE` **一定要带 `WHERE`**。动手前先跑一遍同条件的 `SELECT` 确认命中范围，是能救回一整个下午的习惯。

## 查询子句速查

| 子句 | 作用 | 例子 |
| --- | --- | --- |
| `SELECT DISTINCT` | 去重 | `SELECT DISTINCT category FROM notes` |
| `WHERE` | 行级过滤 | `WHERE year > 2025 AND draft = 0` |
| `IN` / `BETWEEN` | 集合 / 区间 | `WHERE id IN (1,3,5)`、`WHERE age BETWEEN 18 AND 60` |
| `LIKE` | 模糊匹配 | `WHERE title LIKE 'SQL%'`（`%` 任意长度，`_` 单字符） |
| `ORDER BY` | 排序 | `ORDER BY pub_date DESC, id ASC` |
| `GROUP BY` | 分组聚合 | `GROUP BY category` |
| `HAVING` | 对分组结果过滤 | `HAVING COUNT(*) > 2` |
| `LIMIT` / `OFFSET` | 分页 | `LIMIT 10 OFFSET 20` |
| `AS` | 别名 | `SELECT COUNT(*) AS total FROM notes` |

常用聚合函数：`COUNT()`、`SUM()`、`AVG()`、`MIN()`、`MAX()`。`WHERE` 里不能直接用聚合函数的结果 —— 那是 `HAVING` 的活。

**逻辑执行顺序**（与书写顺序不同）：`FROM` → `JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT`。所以 `SELECT` 里定义的别名不能用在 `WHERE` 里，但通常可以用在 `ORDER BY` 里。

## JOIN：把表连起来

```sql
SELECT n.title, a.name AS author
FROM notes AS n
INNER JOIN authors AS a ON n.author_id = a.id
WHERE n.draft = 0;
```

| 类型 | 结果 |
| --- | --- |
| `INNER JOIN` | 只保留两边都匹配上的行 |
| `LEFT JOIN` | 保留左表全部，右表没匹配上填 `NULL` |
| `RIGHT JOIN` | 保留右表全部（较少用，通常调换表序改写为 LEFT） |
| `FULL OUTER JOIN` | 两边都保留（MySQL 不直接支持，需用 UNION 模拟） |

`LEFT JOIN` 常用于「列出所有分类并统计条目数」这类需要保留零值一方的场景；此时对右表字段的过滤条件要放在 `ON` 里，放在 `WHERE` 里会把 `NULL` 行过滤掉，效果退化成 INNER JOIN。

## 建表与约束

```sql
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  title      VARCHAR(200) NOT NULL,
  category   VARCHAR(40)  DEFAULT '未分类',
  draft      INTEGER      DEFAULT 0,
  pub_date   DATE,
  UNIQUE (title, pub_date)
);
```

`PRIMARY KEY` 唯一且非空；`NOT NULL` 禁止空值；`UNIQUE` 保证列组合不重复；`FOREIGN KEY` 维护表间引用完整性。给常出现在 `WHERE` / `JOIN` 条件上的列建索引能显著加速查询，但会拖慢写入，别给每列都建。

## 容易踩的坑

- **`NULL` 的比较**：`NULL = NULL` 结果不是 true，判断空值要用 `IS NULL` / `IS NOT NULL`。
- **`SELECT *`**：多取无用列、表结构一改就出错，生产查询里明确列出字段。
- **`WHERE` 里对列做运算**：`WHERE YEAR(pub_date) = 2026` 会让索引失效，改写成范围条件 `pub_date >= '2026-01-01' AND pub_date < '2027-01-01'`。
- **方言差异**：分页在 MySQL/SQLite 是 `LIMIT`，SQL Server 用 `TOP` / `OFFSET FETCH`，PostgreSQL 用 `LIMIT ... OFFSET`；字符串拼接、日期函数也各不相同。
- **深分页**：`OFFSET 100000` 需要先扫过十万行，改用基于上次最大 ID 的游标分页。
- **拼接用户输入**：这是 SQL 注入的根源，一律用参数化查询（预编译语句）。

## 参考

依据 [菜鸟教程 · SQL 教程](https://www.runoob.com/sql/sql-tutorial.html) 的章节脉络（SELECT DISTINCT、WHERE、AND/OR、ORDER BY、INSERT、UPDATE、DELETE、LIKE、IN、BETWEEN、别名、JOIN、函数）整理。本文为要点归纳与自写示例，不同数据库的方言差异请以各自文档为准。
