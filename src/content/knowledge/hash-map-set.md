---
title: '哈希、集合与去重技巧速查'
description: 'Map / Set / WeakMap 的差别、常见去重与分组写法，以及「键」选择上的几个隐蔽坑。'
pubDate: 2026-11-09
category: '算法与数据结构'
tags: ['算法', 'Map', '去重']
pinned: false
draft: false
---

把「查找」从 `O(n)` 降到均摊 `O(1)`，通常只要一个 `Map` 或 `Set`。这类代码写起来很短，但**键的类型、相等性判定和内存持有方式**决定了它到底对不对、会不会泄漏。

## 四种容器怎么选

| 容器 | 存什么 | 键的类型 | 可遍历 | 垃圾回收 |
| --- | --- | --- | --- | --- |
| `Object` | 键值映射 | 字符串 / Symbol | 是 | 键一直被持有 |
| `Map` | 键值映射 | **任意值**（含对象） | 是，按插入顺序 | 键一直被持有 |
| `Set` | 唯一值集合 | — | 是，按插入顺序 | 值一直被持有 |
| `WeakMap` / `WeakSet` | 关联元数据 | 仅对象 | 否 | 键无其他引用时可被回收 |

```js
const m = new Map();
const key = { id: 1 };
m.set(key, '元数据');
m.get(key);            // '元数据'
m.set('1', '字符串键'); // 与 key 互不影响

const meta = new WeakMap();
meta.set(domNode, { clicks: 0 });  // domNode 被移除后条目可自动回收
```

`Map` 用 **SameValueZero** 判断键相等：对象按引用比较，所以 `{ id: 1 }` 和另一个 `{ id: 1 }` 是两个键；`NaN` 与 `NaN` 相等，`+0` 与 `-0` 相等。普通对象当字典时键会被转成字符串，`obj[{}]` 全落到 `"[object Object]"` 上。

## 去重与分组

```js
// 原始值去重
const tags = [...new Set(notes.flatMap(n => n.tags))];

// 按字段去重：保留第一次出现的那条
const seen = new Set();
const unique = notes.filter(n => {
  if (seen.has(n.id)) return false;
  seen.add(n.id);
  return true;
});

// 分组：Map 比反复 filter 高效得多
const grouped = new Map();
for (const note of notes) {
  if (!grouped.has(note.category)) grouped.set(note.category, []);
  grouped.get(note.category).push(note);
}

// 计数
const counts = new Map();
for (const n of notes) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
```

`Object.groupBy` / `Map.groupBy` 在较新运行时里可用，但要注意兼容性与它返回的原型差异；手写循环的好处是行为完全可见。

## 交集、差集与索引

```js
const left = new Set(idsA);
const intersection = idsB.filter(id => left.has(id));
const difference = idsB.filter(id => !left.has(id));

// 把两份数据按 id 对齐：先建索引再查，避免 O(n × m)
const byId = new Map(users.map(u => [u.id, u]));
const rows = orders.map(o => ({ ...o, user: byId.get(o.userId) }));
```

做「列表对齐 / 关联」时的通用套路：**把一边预处理成 Map，另一边只遍历一次**。这个改动几乎总能把嵌套循环降一个数量级，且代码更短。

## 容易踩的坑

- **用对象数组直接 `new Set` 去重**：对象按引用比较，看起来相同的两条记录不会被去掉；先映射成稳定键（如 `id`）。
- **拿普通对象当 Map**：数字键被转字符串、`__proto__` / `constructor` 可能引发原型污染；用 `Map` 或 `Object.create(null)`。
- **`Map` 的键一直被强引用**：缓存越攒越多导致内存泄漏，需要缓存淘汰或改用 `WeakMap`（但后者不能遍历、没有 `size`）。
- **在 `Set` 里存 `NaN` 以为会重复**：SameValueZero 下 `NaN` 与自己相等，只会留一个。
- **遍历时改动集合**：`Set` / `Map` 迭代期间新增元素可能被访问到，行为不好推理，先收集再统一修改。
- **`JSON.stringify` 当对象去重键**：属性顺序不同就得到不同字符串，嵌套与 `undefined` 还会丢信息。
- **把大数组反复 `includes`**：每次都是 `O(n)`，整体 `O(n²)`；换成 `Set.has`。
- **`WeakMap` 里存原始值**：会直接抛错，WeakMap 的键只能是对象。
- **忘了 `Map` 的插入顺序语义**：依赖它做「有序」时要确认没有删除后重插改变位置。

## 参考

依据 [MDN · Map](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Map) 与 [MDN · Set](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Set) 的知识脉络（键相等性、遍历、适用边界）整理。本文为要点归纳与自写示例，复杂度分析见本知识库的《复杂度与常见数据结构速查》。
