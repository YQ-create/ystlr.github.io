---
title: 'SQL 进阶：子查询、CTE 与窗口函数'
description: '把「先算一组中间结果再对外查询」写清楚：CTE、相关子查询与 ROW_NUMBER / RANK 的典型用法。'
pubDate: 2026-11-09
category: '数据与存储'
tags: ['数据库', 'SQL', '进阶']
pinned: false
draft: false
---

写复杂 SQL 的分水岭是：**能不能把问题拆成一层层有名字的中间结果**。CTE 负责「命名与分层」，窗口函数负责「不折叠行的分组计算」，子查询负责「把一步的结果当条件或临时表用」。

## 子查询的三种位置

```sql
-- ① 当条件：找出浏览量高于平均值的笔记
SELECT title, views FROM notes
WHERE views > (SELECT AVG(views) FROM notes);

-- ② 当临时表：先聚合再 JOIN
SELECT c.name, s.total FROM categories c
JOIN (SELECT category_id, COUNT(*) AS total FROM notes GROUP BY category_id) s
  ON s.category_id = c.id;

-- ③ 相关子查询：每行都要与外部行关联着算一次
SELECT n.title FROM notes n
WHERE EXISTS (
  SELECT 1 FROM note_tags t WHERE t.note_id = n.id AND t.tag_id = 7
);
```

`IN` 适合静态小集合，`EXISTS` 在关联条件下通常更清晰也更易优化；子查询返回多列或多行当值时容易报错，先单独跑一遍确认结果形状。

## CTE：把长查询拆成几段

```sql
WITH recent AS (
  SELECT id, category_id, title, views
  FROM notes
  WHERE published_at >= '2026-01-01'
), ranked AS (
  SELECT
    category_id, title, views,
    ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY views DESC) AS rn
  FROM recent
)
SELECT category_id, title, views
FROM ranked
WHERE rn <= 3
ORDER BY category_id, rn;
```

| 特性 | 说明 |
| --- | --- |
| `WITH ... AS (...)` | 给中间结果命名，主查询直接引用 |
| 多个 CTE | 逗号分隔，后面的可以引用前面的 |
| `WITH RECURSIVE` | 处理树形/层级结构（分类树、评论楼中楼） |
| 与子查询的区别 | 可读性更好、可复用；是否内联由优化器决定 |

```sql
-- 递归：从根分类一路展开子分类
WITH RECURSIVE tree(id, name, depth) AS (
  SELECT id, name, 0 FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, t.depth + 1
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree ORDER BY depth, id;
```

## 窗口函数：分组但不折叠行

普通 `GROUP BY` 把多行压成一行；窗口函数**保留每一行**，同时在该行的「窗口」里算出排名、累计值或前后行的值。

| 函数 | 作用 | 典型用途 |
| --- | --- | --- |
| `ROW_NUMBER()` | 组内连续序号 | 每组取前 N 条、去重 |
| `RANK()` / `DENSE_RANK()` | 并列排名（会跳号 / 不跳号） | 榜单 |
| `LAG()` / `LEAD()` | 取上一行 / 下一行的值 | 环比、相邻差 |
| `SUM() OVER (...)` | 累计或分区合计 | 累计销售额、占比 |
| `NTILE(n)` | 均分成 n 桶 | 分位数分层 |

```sql
SELECT
  category_id, title, views,
  ROW_NUMBER() OVER w AS rn,
  SUM(views) OVER (PARTITION BY category_id) AS cat_total,
  LAG(views) OVER (ORDER BY published_at) AS prev_views
FROM notes
WINDOW w AS (PARTITION BY category_id ORDER BY views DESC);
```

`PARTITION BY` 划窗口、`ORDER BY` 定窗口内顺序；只写 `OVER ()` 就是把整张结果集当一个窗口。

## 容易踩的坑

- **在 `WHERE` 里直接用窗口函数的结果**：窗口函数在 `WHERE` 之后计算，必须像上面那样套一层 CTE 或子查询再过滤。
- **混用 `WHERE` 与聚合条件**：分组后的筛选写 `HAVING`，分组前的写 `WHERE`，放错位置结果差很多。
- **`ROW_NUMBER` 遇到并列值时结果不稳定**：`ORDER BY` 没定唯一顺序时，同一批数据两次执行可能给出不同 rn，补一个 `id` 作决胜列。
- **`UNION` 当 `UNION ALL` 用**：`UNION` 会去重并排序，数据量大时白白开销；确定无重复就用 `UNION ALL`。
- **递归 CTE 忘了终止条件**：层级数据里出现循环引用会一直展开，必要时加深度上限。
- **相关子查询写在大表上**：逐行执行一次，容易变成 N 次全表扫；改写成 JOIN 或预先聚合。
- **`COUNT(col)` 当成 `COUNT(*)`**：前者会跳过 `NULL`，「有多少条」和「有多少个非空值」不是一回事。
- **忽略 NULL 的排序位置**：不同数据库把 NULL 排在最前或最后，跨库迁移时排名会变。

## 参考

依据 [SQLite · 窗口函数文档](https://www.sqlite.org/windowfunctions.html) 与 [菜鸟教程 · SQLite 教程](https://www.runoob.com/sqlite/sqlite-tutorial.html) 的知识脉络（子查询、CTE、窗口函数）整理。本文为要点归纳与自写示例；基础 `SELECT` / `JOIN` 见本知识库的《SQL 增删改查与连接查询速查》，各数据库对窗口函数的支持范围以所用版本文档为准。
