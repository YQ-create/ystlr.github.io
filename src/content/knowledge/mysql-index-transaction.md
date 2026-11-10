---
title: 'MySQL 索引与事务速查'
description: '最左前缀、EXPLAIN 怎么看、ACID 与隔离级别：慢查询和「数据莫名不一致」的两条主线。'
pubDate: 2026-11-09
category: '数据与存储'
tags: ['实战', '数据']
pinned: false
draft: false
---

大部分 MySQL 线上问题可以分成两类：**查得慢**（索引没用上）和**改错了**（事务边界没划清）。前者看执行计划，后者看隔离级别与锁范围，两条线分开排查会快很多。

## 索引与最左前缀

索引本质上是一份排好序的副本。复合索引 `(a, b, c)` 能命中的是 `a`、`a+b`、`a+b+c` 这类**从左往右连续**的条件，跳过 `a` 直接查 `b` 就用不上它。

```sql
CREATE INDEX idx_notes_cat_date ON notes (category, pub_date);

-- 能用上：category 等值 + pub_date 范围
SELECT id, title FROM notes
WHERE category = 'Web 原理' AND pub_date >= '2026-01-01'
ORDER BY pub_date DESC;

-- 用不上复合索引（缺最左列）
SELECT id FROM notes WHERE pub_date >= '2026-01-01';
```

| 写法 | 索引是否可用 | 原因 |
| --- | --- | --- |
| `WHERE a = 1 AND b > 2` | 用到 `a`、`b` | 等值在前，范围在后 |
| `WHERE a LIKE 'web%'` | 可以 | 前缀确定，能定位范围 |
| `WHERE a LIKE '%web'` | 不行 | 前缀未知 |
| `WHERE UPPER(a) = 'WEB'` | 不行 | 对列做函数运算 |
| `WHERE a + 1 = 3` | 不行 | 同上，改写成 `a = 2` |
| `WHERE a = 1 OR b = 2` | 视情况 | 可能退化为全表扫，考虑拆成 `UNION` |

**覆盖索引**是另一个省钱技巧：查询只需要索引里的列时，引擎不必回表取整行。所以别习惯性 `SELECT *`，只取需要的字段。

## 用 EXPLAIN 判断

```sql
EXPLAIN SELECT id, title FROM notes WHERE category = 'Web 原理' ORDER BY pub_date DESC;
```

| 字段 | 该看什么 |
| --- | --- |
| `type` | 从好到差大致是 `system` / `const` → `ref` → `range` → `index` → `ALL`；出现 `ALL` 就是全表扫描 |
| `key` | 实际选中的索引，`NULL` 表示没用上 |
| `rows` | 预估要扫描的行数，越小越好 |
| `Extra` | `Using index` 是覆盖索引；`Using filesort` / `Using temporary` 说明排序或分组没吃到索引 |

统计信息过期、数据量太小、区分度太低（例如只有两三种取值的 `status`）都会让优化器放弃索引，这不一定是「索引建错了」。

## 事务与隔离级别

```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- 确认两条都成功再提交；任何一步失败就整体回滚
COMMIT;
-- ROLLBACK;
```

| 特性 | 含义 |
| --- | --- |
| 原子性 A | 一组操作要么全成功，要么全回滚 |
| 一致性 C | 从一个合法状态到另一个合法状态，约束不被破坏 |
| 隔离性 I | 并发事务之间互相干扰的程度，由隔离级别控制 |
| 持久性 D | 提交后即使宕机也不丢 |

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 备注 |
| --- | --- | --- | --- | --- |
| READ UNCOMMITTED | 会 | 会 | 会 | 基本不用 |
| READ COMMITTED | 不会 | 会 | 会 | 每次读都生成新快照 |
| REPEATABLE READ | 不会 | 不会 | InnoDB 下基本避免 | MySQL 默认 |
| SERIALIZABLE | 不会 | 不会 | 不会 | 加锁读，并发代价最高 |

事务要**短**：把网络请求、文件处理、人工确认放进事务里，会让行锁长时间不释放，连接池很快被拖垮。

## 容易踩的坑

- **`UPDATE` / `DELETE` 不带 `WHERE`**：先写 `SELECT` 验证条件，再改成更新语句；生产环境可以开 `sql_safe_updates`。
- **给每个字段都建索引**：索引加速读，却拖慢写并占空间；按实际查询组合建少量复合索引。
- **在索引列上套函数或用隐式类型转换**：字符串列传了数字、日期列套了 `DATE()`，都会让索引失效。
- **只看 `rows` 不看 `Extra`**：`Using filesort` 在大数据量排序时常常才是真正的瓶颈。
- **`autocommit` 下以为自己在事务里**：没显式 `START TRANSACTION` 时每条语句都单独提交，中途失败会留下半截数据。
- **长事务 + 高频更新同一行**：锁等待积累到超时，表现为「偶发接口卡住」。
- **用 `SELECT ... FOR UPDATE` 却不加索引**：锁定范围会扩大成整张表。
- **依赖默认隔离级别做业务正确性**：涉及余额、库存这类并发扣减，仍要靠条件更新（`WHERE stock >= n`）或乐观锁兜底。

## 参考

依据 [菜鸟教程 · MySQL 教程](https://www.runoob.com/mysql/mysql-tutorial.html) 的知识脉络（索引、查询、事务）整理。本文为要点归纳与自写示例，基础 CRUD 可接着看本知识库的《SQL 增删改查与连接查询速查》；隔离级别与锁的具体行为以所用 MySQL / InnoDB 版本官方文档为准。
