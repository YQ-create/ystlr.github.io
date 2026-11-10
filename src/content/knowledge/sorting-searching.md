---
title: '排序与查找算法速查'
description: '常见排序的复杂度与稳定性、二分查找的边界写法，以及 JS 里 sort 到底怎么排。'
pubDate: 2026-11-09
category: '算法与数据结构'
tags: ['进阶', '算法']
pinned: false
draft: false
---

日常业务里绝大多数排序都该交给语言内置方法，真正需要自己写的是**理解比较规则、稳定性和边界条件**。手写算法的价值在于知道什么时候内置排序会「排错」。

## 常见排序对照

| 算法 | 平均 | 最坏 | 空间 | 稳定 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 冒泡 / 选择 | `O(n²)` | `O(n²)` | `O(1)` | 冒泡稳定 / 选择不稳 | 只作教学 |
| 插入排序 | `O(n²)` | `O(n²)` | `O(1)` | 稳定 | **小规模或近乎有序时很快** |
| 归并排序 | `O(n log n)` | `O(n log n)` | `O(n)` | 稳定 | 需要额外空间，适合链表/外部排序 |
| 快速排序 | `O(n log n)` | `O(n²)` | `O(log n)` | 不稳 | 常数小，枢轴选不好会退化 |
| 堆排序 | `O(n log n)` | `O(n log n)` | `O(1)` | 不稳 | 上界稳定、无需额外空间 |
| 计数 / 桶排 | `O(n + k)` | — | `O(k)` | 可稳定 | 只适合取值范围有限的整数 |

**稳定性**指相等元素在排序后保持原有相对顺序。它看起来不起眼，但「先按时间排、再按分类排」这类多关键字排序完全依赖它（否则第二次排序会打乱第一次的结果）。

```js
// JS 的 Array.prototype.sort 自 ES2019 起保证稳定
const notes = [
  { title: 'A', views: 10 },
  { title: 'B', views: 30 },
  { title: 'C', views: 10 },
];
notes.sort((a, b) => b.views - a.views);
// B, A, C —— A 与 C 的先后顺序保持原样
```

## JS `sort` 的三个陷阱

```js
[10, 2, 1].sort();                       // [1, 10, 2]：默认按字符串比较
[10, 2, 1].sort((a, b) => a - b);        // [1, 2, 10]
['é', 'z', 'a'].sort();                  // 按 UTF-16 码元，不是拼音
['é', 'z', 'a'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
```

| 陷阱 | 正确做法 |
| --- | --- |
| 数字不加比较函数 | 传 `(a, b) => a - b` |
| 中文/多语言排序 | `localeCompare(locale)`，必要时配 `Intl.Collator` |
| 比较函数返回布尔值 | 必须返回负数 / 0 / 正数 |
| 排序会改原数组 | 需要保留原顺序就先 `[...arr]` |
| 比较里有昂贵计算 | 预计算排序键（Schwartzian 思路） |

```js
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true });
titles.sort(collator.compare);   // 「第2章」排在「第10章」前面
```

## 二分查找与边界

```js
// 在升序数组里找 target，找不到返回 -1
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;      // 闭区间 [lo, hi]
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);  // 避免 lo + hi 溢出（其他语言更要紧）
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

// 找「第一个 >= target」的位置（左边界）
function lowerBound(arr, target) {
  let lo = 0, hi = arr.length;          // 左闭右开 [lo, hi)
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
```

| 边界写法 | 循环条件 | 更新 | 返回 |
| --- | --- | --- | --- |
| 闭区间 | `lo <= hi` | `hi = mid - 1` | 找不到返回 `-1` |
| 左闭右开 | `lo < hi` | `hi = mid` | `lo` 即插入位置 |

二分的前提是**数据有序且能随机访问**。在链表上做二分没有意义（定位中点本身就要 `O(n)`）；数据频繁变动时，维护有序的成本可能高过直接线性查找。

## 容易踩的坑

- **忘写比较函数**：`[10, 2, 1].sort()` 的结果经常让人以为数据错了。
- **比较函数返回 `a > b`**：布尔值会被转成 0/1，排序结果不正确。
- **直接 `sort()` 改了共享数组**：别处持有的引用也跟着变了，React/Vue 里尤其容易踩。
- **在比较函数里做 I/O 或重计算**：比较会被调用 `O(n log n)` 次，代价被放大很多倍。
- **二分边界写错导致死循环**：`mid` 不更新、`hi = mid` 配 `lo <= hi` 都会卡住，先固定一种区间写法。
- **忽略重复元素**：二分找到的是「某一个」匹配项，要第一个/最后一个得用边界版本。
- **对未排序的数据做二分**：结果随缘，且不会报错，是最难发现的一类 bug。

## 参考

依据 [菜鸟教程 · 十大经典排序算法](https://www.runoob.com/w3cnote/ten-sorting-algorithm.html) 的知识脉络（复杂度、稳定性、各算法思路）整理。本文为要点归纳与自写示例，内置排序与国际化比较以所用 JavaScript 引擎的文档为准。
