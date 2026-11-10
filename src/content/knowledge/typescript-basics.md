---
title: 'TypeScript 类型、接口与泛型速查'
description: '基础类型标注、接口与联合类型、泛型与常用工具类型，附一份从 JavaScript 迁移时的检查清单。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['进阶', '前端']
pinned: false
draft: false
---

TypeScript 给 JavaScript 加的是**编译期的形状约束**，运行时并不存在「类型」这回事。真正要记的不是语法有多少，而是三件事：值的形状怎么描述、多个形状怎么组合、重复逻辑怎么用泛型抽掉。

## 基础类型与标注

| 类型 | 写法 | 说明 |
| --- | --- | --- |
| 原始值 | `string` / `number` / `boolean` | 对应 JS 的原始类型，不要用包装对象 `String` |
| 空值 | `null` / `undefined` / `void` | `void` 常用于「没有返回值」的函数 |
| 数组 | `string[]` 或 `Array<string>` | 两种写法等价 |
| 元组 | `[string, number]` | 固定长度、每位类型固定 |
| 任意 | `unknown` / `any` | `unknown` 必须收窄后才能用，`any` 会绕开所有检查 |
| 永不 | `never` | 抛错、死循环，或穷尽判断后的分支 |
| 字面量 | `'light' \| 'dark'` | 把取值限制成枚举式常量 |

```ts
let theme: 'light' | 'dark' = 'light';
theme = 'dark';

function formatSize(bytes: number, unit = 'KB'): string {
  return `${(bytes / 1024).toFixed(1)} ${unit}`;
}

const ids: Array<number> = [1, 2, 3];
```

多数位置不需要手写类型：初始化时的推断、`map` / `filter` 的回调参数、返回值都能从上下文推出来。**给参数和跨模块的返回值标注，给局部变量留白**，是性价比最高的写法。

## 接口、类型别名与联合类型

`interface` 描述对象形状且可以声明合并、被 `extends`；`type` 能表示联合、交叉、字面量与工具类型。日常里用 `type` 定义数据、`interface` 定义可扩展的对象契约即可，不必纠结「谁更正宗」。

```ts
type Status = 'idle' | 'loading' | 'done' | 'error';

interface Note {
  id: string;
  title: string;
  tags?: string[];          // 可选属性
  readonly createdAt: Date; // 只允许初始化时赋值
}

type NoteWithStatus = Note & { status: Status };

function label(status: Status): string {
  switch (status) {
    case 'idle': return '待开始';
    case 'loading': return '加载中';
    case 'done': return '完成';
    case 'error': return '出错';
    default: {
      const exhaustive: never = status; // 漏掉分支时这里会报错
      return exhaustive;
    }
  }
}
```

联合类型配合**判别字段**最实用：加一个 `kind: 'text' | 'image'`，在 `switch` 里判断 `kind`，每个分支里其余字段的类型自动收窄，不用到处写 `as`。

## 泛型与常用工具类型

泛型就是「把类型当参数传进去」，让函数不丢掉输入的类型信息。

```ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const n = first([1, 2, 3]);        // number | undefined
const s = first(['a', 'b']);       // string | undefined

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };
```

| 工具类型 | 作用 | 典型用途 |
| --- | --- | --- |
| `Partial<T>` | 全部属性可选 | 局部更新的 patch 对象 |
| `Required<T>` | 全部属性必填 | 校验后的完整配置 |
| `Pick<T, K>` | 只留几个键 | 列表只取摘要字段 |
| `Omit<T, K>` | 去掉几个键 | 提交表单时去掉 `id` |
| `Record<K, V>` | 构造字典 | 按状态分组的映射 |
| `ReturnType<F>` | 取函数返回值类型 | 复用已有函数的返回形状 |
| `Awaited<T>` | 展开 Promise | 包装异步结果 |

```ts
type NotePatch = Partial<Pick<Note, 'title' | 'tags'>>;
const counters: Record<Status, number> = { idle: 0, loading: 0, done: 0, error: 0 };
```

## 容易踩的坑

- **`any` 当创可贴**：一处 `any` 会把不安全顺着调用链传下去，优先用 `unknown` + 类型收窄，或先把形状补清楚。
- **用 `as` 骗过编译器**：断言不改变运行时值。接口返回的数据要校验，别把「我猜它是」写成「它就是」。
- **可选属性当成一定存在**：`tags?.length` 之后就直接当数组用，仍可能拿到 `undefined`；先给默认值或判空。
- **`interface` 同名会自动合并**：多处声明同名接口，属性会悄悄叠加，和「覆盖」的直觉相反。
- **忘了 `strictNullChecks`**：不开启时 `null` / `undefined` 能赋给任何类型，一大半类型保护形同虚设。
- **把类型检查当运行时校验**：编译过了不代表接口数据合规，来自网络、JSON、表单的值仍需运行时验证。
- **在泛型里过度抽象**：`T extends Record<string, unknown>` 套三层之后，报错信息没人看得懂，能写具体就写具体。

## 参考

依据 [菜鸟教程 · TypeScript 教程](https://www.runoob.com/typescript/ts-tutorial.html) 的知识脉络（基础类型、接口、泛型）整理。本文为要点归纳与自写示例，工具类型的完整清单以项目所用 TypeScript 版本的官方文档为准。
