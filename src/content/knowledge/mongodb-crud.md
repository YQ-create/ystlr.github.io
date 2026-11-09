---
title: 'MongoDB 文档模型与 CRUD 速查'
description: '集合与文档、查询运算符、更新与聚合：从 SQL 思维切到文档模型时最该先换的那几个概念。'
pubDate: 2026-11-09
category: '数据与存储'
tags: ['数据库', 'MongoDB', '速查']
pinned: false
draft: false
---

MongoDB 存的是 **BSON 文档**，不是行。它把「一条记录有哪些字段」的自由度交给每条文档，代价是很多在 SQL 里由表结构保证的约束，得由应用层自己守住。

## 与关系型数据库的对照

| SQL | MongoDB | 说明 |
| --- | --- | --- |
| database | database | 库 |
| table | collection | 集合，不强制统一结构 |
| row | document | 文档，形如 `{ key: value }` |
| column | field | 字段 |
| primary key | `_id` | 不指定时自动生成 ObjectId |
| `JOIN` | 嵌入文档 / `$lookup` | 更推荐把一起读的数据嵌进去 |
| `WHERE` | 查询文档 | `{ status: 'done' }` 这类对象 |
| 事务 | 单文档原子 / 多文档事务 | 单文档更新天然原子 |

**建模先问「一起读还是一起改」**：一起展示、很少单独修改的子数据（标签、地址、评论摘要）适合内嵌；会被多处引用、独立增长、频繁更新的数据（用户、文章）适合放引用 ID。

## CRUD 与查询运算符

```js
// 插入：_id 不写会自动生成
db.notes.insertOne({
  title: 'HTTP 缓存',
  tags: ['网络', 'HTTP'],
  views: 0,
  createdAt: new Date(),
});

// 查询：组合条件、投影、排序、分页
db.notes.find(
  { views: { $gte: 10 }, tags: 'HTTP' },
  { title: 1, views: 1, _id: 0 },
).sort({ createdAt: -1 }).limit(20);

// 更新：用运算符改局部字段，别把整篇文档覆盖回去
db.notes.updateOne(
  { title: 'HTTP 缓存' },
  { $inc: { views: 1 }, $set: { updatedAt: new Date() }, $addToSet: { tags: '速查' } },
  { upsert: false },
);

db.notes.deleteMany({ views: 0, createdAt: { $lt: new Date('2026-01-01') } });
```

| 类别 | 运算符 | 含义 |
| --- | --- | --- |
| 比较 | `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` | 等于、不等于、大小、集合内 |
| 逻辑 | `$and` `$or` `$not` `$nor` | 组合条件 |
| 元素 | `$exists` `$type` | 字段是否存在 / 类型是否符合 |
| 数组 | `$all` `$elemMatch` `$size` | 数组匹配 |
| 更新 | `$set` `$unset` `$inc` `$push` `$addToSet` `$pull` | 改字段、计数、数组增删 |

`$addToSet` 与 `$push` 的区别是前者去重 —— 标签这类不该重复的字段一律用 `$addToSet`。

## 索引与聚合

```js
db.notes.createIndex({ createdAt: -1 });                 // 单字段
db.notes.createIndex({ category: 1, createdAt: -1 });    // 复合索引，遵循最左前缀
db.notes.createIndex({ title: 'text' });                  // 文本索引

db.notes.find({ category: 'Web 原理' }).explain('executionStats');

// 聚合：分组统计再排序
db.notes.aggregate([
  { $match: { views: { $gt: 0 } } },
  { $group: { _id: '$category', total: { $sum: 1 }, hits: { $sum: '$views' } } },
  { $sort: { hits: -1 } },
]);
```

`explain()` 里重点看 `COLLSCAN`（全集合扫描）有没有变成 `IXSCAN`、`totalDocsExamined` 是不是远大于 `nReturned`。复合索引的字段顺序按「等值条件 → 排序字段 → 范围条件」安排通常更稳。

## 容易踩的坑

- **`updateOne` 传整篇文档当第二个参数**：不带 `$set` 的替换语义会丢掉未提交的字段，并发下尤其容易互相覆盖。
- **把 SQL 的 JOIN 习惯直接搬过来**：文档库里到处 `$lookup` 会很慢，先想想能不能在写入时把数据嵌好。
- **字段类型不统一**：同一个 `views` 有时是数字有时是字符串，`$gte` 的结果就不符合直觉；类型约束要在写入端守住。
- **不加索引就上 `$regex` 前缀通配**：`/^HTTP/` 还能用索引，`/HTTP/` 只能全表扫。
- **跳过分页用大 `skip`**：`skip(100000)` 仍要遍历前十万条，深分页应改按上一页的排序值做范围查询。
- **`upsert` 与稀疏条件混用**：条件写得太宽会意外新建出一批「空壳文档」。
- **把 ObjectId 当字符串比较**：`_id` 是 ObjectId 类型，拿字符串去查会一条也匹配不上。
- **忘记单文档大小上限**：无节制地往内嵌数组里 `$push`，文档会越滚越大，最终撞上 16MB 限制。

## 参考

依据 [菜鸟教程 · MongoDB 教程](https://www.runoob.com/mongodb/mongodb-tutorial.html) 与 [MongoDB 查询文档](https://www.runoob.com/mongodb/mongodb-query.html) 的知识脉络（文档模型、CRUD、运算符）整理。本文为要点归纳与自写示例，索引与聚合的完整行为以所用服务器版本的官方文档为准。
