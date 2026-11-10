---
title: 'Web 可访问性速查'
description: '语义、键盘、对比度、替代文本与 ARIA 的使用边界：不靠重写页面也能明显改善可用性。'
pubDate: 2026-11-09
category: '前端基础'
tags: ['实战', '前端']
pinned: false
draft: false
---

可访问性不是「给残障用户另做一版」，而是**别把浏览器和辅助技术本来就能用的能力破坏掉**。优先级很明确：原生语义 > 正确的键盘行为 > 视觉与文本提示 > 最后才考虑 ARIA 补齐。

## 四条基线

| 基线 | 检查什么 | 常见修复 |
| --- | --- | --- |
| 可感知 | 图片有替代文字、颜色不是唯一信息载体 | 写 `alt`、加文字标签或图标说明 |
| 可操作 | 全站功能都能用键盘完成 | 用真按钮、保留焦点样式、管理焦点 |
| 可理解 | 表单有标签、错误提示具体 | `label for`、错误信息关联到字段 |
| 健壮 | 语义正确、能被读屏软件解析 | 用原生元素，别用 `div` 模拟控件 |

```html
<!-- 可点击的就是按钮，键盘和读屏都会自动处理 -->
<button type="button" aria-expanded="false" aria-controls="filters">
  筛选
</button>
<div id="filters" hidden>…</div>

<label for="email">邮箱</label>
<input id="email" type="email" required aria-describedby="email-hint" />
<p id="email-hint">仅用于接收回复，不会公开。</p>
```

## 替代文本与语义

`alt` 写的是**这张图在上下文里承担的信息**，不是「一张图片」。纯装饰图用 `alt=""`（不要省略 `alt` 属性），否则读屏会把文件名念出来。

| 场景 | 写法 |
| --- | --- |
| 装饰性背景 / 分隔图 | `alt=""` 或交给 CSS `background` |
| 信息图 / 截图 | 简述结论，复杂数据另配文字表格 |
| 图片作为链接 | `alt` 描述链接目标，不是图片外观 |
| 图标按钮 | 按钮内放可见或视觉隐藏的文字，或 `aria-label` |

标题层级要连续：`h1` 一页一个，`h2` 分大节、`h3` 分子节，跳级会让读屏的「按标题导航」失去意义。

## 键盘与焦点

```css
/* 不要粗暴去掉焦点环；用 :focus-visible 区分键盘与鼠标 */
:focus-visible {
  outline: 2px solid #ff6a2b;
  outline-offset: 3px;
}

/* 视觉隐藏但读屏可读 */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- **Tab 顺序跟着 DOM 走**：别用正数 `tabindex`，需要纳入焦点用 `tabindex="0"`。
- **自定义弹层要管焦点**：打开时把焦点移进去、限制在内部循环、`Esc` 关闭后把焦点还给触发按钮。
- **跳过导航链接**：长页头前放一个可聚焦的「跳到主内容」，键盘用户不用每次 Tab 二十下。
- **点击区域别只挂在 `div` 上**：`onClick` 不会带来键盘可操作性。

## ARIA 的使用边界

ARIA 只改变**辅助技术读到什么**，不提供键盘行为、不提供样式、也不会自动把 `div` 变成按钮。第一条规则是：能用原生元素就别用 ARIA。

| 属性 | 用途 | 注意 |
| --- | --- | --- |
| `role` | 声明元素角色 | 别给 `<button>` 再写 `role="button"` |
| `aria-label` / `aria-labelledby` | 提供可访问名称 | 会覆盖元素内的可见文字 |
| `aria-expanded` / `aria-controls` | 折叠控件状态 | 状态变化时必须同步更新 |
| `aria-live` | 宣告动态内容 | `polite` 用于提示，`assertive` 慎用 |
| `aria-hidden="true"` | 对读屏隐藏 | **不要**加在可聚焦元素上 |

## 容易踩的坑

- **`outline: none` 一删了之**：键盘用户完全不知道焦点在哪，改用 `:focus-visible` 定制样式。
- **占位符当标签**：`placeholder` 在输入后消失，且与 `label` 不在同一语义层，不能替代 `label`。
- **`div` 模拟按钮**：没有 Enter / Space 响应、没有角色、不可聚焦；直接用 `<button>`。
- **只靠颜色表达状态**：红绿在色觉差异下难以区分，补文字或图标。
- **对比度不足**：浅灰小字在深色背景上最常踩，正文建议至少 4.5:1，大字号 3:1。
- **`aria-hidden` 包住可聚焦控件**：焦点能进去但读屏读不到，出现「焦点黑洞」。
- **状态属性不同步**：菜单展开了却仍是 `aria-expanded="false"`，比不用 ARIA 更误导。
- **把 `alt` 写成文件名或「图片」**：等于没提供信息，还多一段噪声。

## 参考

依据 [MDN · Web 可访问性](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Accessibility) 的知识脉络（语义、键盘、ARIA 边界）整理。本文为要点归纳与自写示例，标签语义部分可与本知识库的《HTML 语义化与常用标签速查》对照阅读。
