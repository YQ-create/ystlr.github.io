---
title: 'Redis 五种基本数据类型与选型'
description: 'String / Hash / List / Set / ZSet 各自适合存什么，以及过期时间和缓存穿透要点。'
pubDate: 2026-11-03
category: '数据与存储'
tags: ['核心', '数据']
pinned: false
draft: false
---

Redis 是内存中的键值数据库，常被用作缓存、计数器、排行榜和轻量队列。选型的起点不是「数据长什么样」，而是「**我要对这个数据做什么操作**」—— 需要排序就选 ZSet，需要去重就选 Set，需要按字段局部更新就选 Hash。

## 五种基本类型

| 类型 | 结构 | 典型场景 | 示例命令 |
| --- | --- | --- | --- |
| String | 单个值（可存文本、数字、二进制） | 缓存、计数器、分布式锁 | `SET` `GET` `INCR` |
| Hash | 字段 → 值的映射 | 对象、用户资料、可局部更新的配置 | `HSET` `HGET` `HGETALL` |
| List | 有序可重复的双端队列 | 消息队列、最新动态、时间线 | `LPUSH` `RPOP` `LRANGE` |
| Set | 无序去重集合 | 标签、共同关注、抽奖去重 | `SADD` `SISMEMBER` `SINTER` |
| Sorted Set | 带 score 的去重集合，按分数有序 | 排行榜、延迟队列、按时间排序 | `ZADD` `ZRANGE` `ZRANK` |

```redis
SET  session:u42  "token-abc"  EX 1800      # 30 分钟后自动过期
INCR pageview:home                          # 原子自增，天然适合计数

HSET user:42 name "Lin" city "Shenzhen"
HGET user:42 name                           # 只取一个字段，不必读整个对象

SADD tags:note:1 "前端" "CSS" "速查"
SISMEMBER tags:note:1 "CSS"                 # 1

ZADD rank:2026 120 "note:1" 98 "note:2"
ZRANGE rank:2026 0 9 REV WITHSCORES         # 前十名（高到低）
```

`EX` / `PX` 直接在 `SET` 时设过期时间，比先 `SET` 再 `EXPIRE` 更稳妥（两条命令之间进程挂掉就会留下永不过期的键）。`TTL key` 查看剩余时间，返回 `-1` 表示没设过期、`-2` 表示键已不存在。

## 什么时候用哪种

- **整个对象一起读写** → String 里存 JSON 最简单，但改一个字段要反序列化再整体写回，有并发覆盖风险。
- **需要频繁改单个字段** → Hash，用 `HSET` 只动一个字段。
- **需要顺序但允许重复** → List；**需要去重或集合运算** → Set。
- **需要按某个数值排序** → Sorted Set，score 可以是分数、时间戳或优先级。

此外还有 Bitmaps（签到、布尔统计）、HyperLogLog（海量去重计数，有误差但极省内存）、Stream（带消费组的消息流），属于特定场景的扩展类型。

## 缓存使用的三个经典问题

| 问题 | 现象 | 常见对策 |
| --- | --- | --- |
| 缓存穿透 | 查询一个根本不存在的 key，每次都打到数据库 | 空结果也缓存一小段时间；布隆过滤器 |
| 缓存击穿 | 某个热点 key 恰好过期，大量请求同时回源 | 互斥锁只放一个请求回源；热点键逻辑上不过期 |
| 缓存雪崩 | 大批 key 在同一时刻集中过期 | 过期时间加随机抖动；多级缓存 |

还要注意**缓存与数据库的一致性**：常见做法是「先更新数据库，再删除缓存」，而不是先删缓存或去更新缓存值。删除失败时要能重试。

## 容易踩的坑

- **`KEYS *` 上生产**：会阻塞主线程，用 `SCAN` 分批遍历。
- **`HGETALL` 拉大对象**：一个 Hash 里几万字段时单次返回会拖慢整个实例，改用 `HMGET` 或分批。
- **不给缓存设过期**：内存只增不减，最终触发淘汰策略，可能把重要数据挤掉。
- **把 Redis 当永久存储**：默认是内存数据库，持久化（RDB / AOF）也有窗口期，关键数据仍应落在主库。
- **大 key / 热 key**：一个 String 存几 MB、或某个 key 承受绝大部分流量，都会造成延迟尖刺，需要拆分或本地缓存。
- **`DEL` 大集合**：删除百万元素的集合是同步阻塞操作，用 `UNLINK` 异步释放。

## 参考

依据 [菜鸟教程 · Redis 教程](https://www.runoob.com/redis/redis-tutorial.html) 的知识脉络（数据类型、键管理、过期与持久化）整理。本文为要点归纳与自写示例，完整命令清单可查 [Redis 命令参考](https://www.runoob.com/redis/redis-commands.html)。
