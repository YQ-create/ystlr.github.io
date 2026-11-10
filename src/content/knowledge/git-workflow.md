---
title: 'Git 日常工作流与撤销操作'
description: '工作区 / 暂存区 / 版本库三层模型，以及改错了分别该怎么撤回。'
pubDate: 2026-11-02
category: '工程实践'
tags: ['核心', '工具']
pinned: true
draft: false
---

Git 的心智模型就三层：**工作区**（你正在编辑的文件）→ **暂存区**（`git add` 后，下一次提交的候选）→ **版本库**（`git commit` 后的历史）。几乎所有「撤销」命令的区别，都在于它把哪一层恢复到哪一层。

## 一天里最常用的命令

```bash
git status                        # 任何时候不确定就先看这个
git add -p                        # 分块暂存，避免把调试代码一起提交
git commit -m "fix: 修正日期格式"
git pull --rebase                 # 先同步远端，减少无意义的合并提交
git push
```

```bash
git switch -c feat/search         # 建分支并切过去（新语法，比 checkout 明确）
git switch main
git log --oneline --graph -12     # 看最近 12 条历史的分支图
git diff                          # 工作区 vs 暂存区
git diff --staged                 # 暂存区 vs 版本库
```

提交信息推荐写成「类型: 简短说明」，例如 `feat:` / `fix:` / `docs:` / `refactor:` / `perf:`。一行说不清时，空一行再写正文解释**为什么**改，而不是复述改了哪些行。

## 撤销：按位置选命令

| 我想撤回… | 命令 | 影响范围 |
| --- | --- | --- |
| 工作区里某个文件的改动 | `git restore <file>` | 丢弃未暂存的修改，不可恢复 |
| 已 `add` 但不想提交了 | `git restore --staged <file>` | 只移出暂存区，文件改动还在 |
| 上一次提交的信息写错了 | `git commit --amend -m "…"` | 改写最近一次提交 |
| 上一次提交漏了文件 | `git add <file> && git commit --amend --no-edit` | 补进最近一次提交 |
| 提交还没 push，想整个撤掉 | `git reset --soft HEAD~1` | 保留改动在暂存区 |
| 提交还没 push，改动也不想要了 | `git reset --hard HEAD~1` | **危险**：改动直接消失 |
| 提交已经 push 给别人了 | `git revert <sha>` | 新增一个「反向提交」，历史安全 |

`reset` 改写历史，`revert` 追加历史 —— **已经共享出去的提交只用 `revert`**，否则协作者本地历史会分叉。`--hard` 之前如果不确定，先 `git stash` 留一份，或干脆复制文件出来。

```bash
git stash push -m "临时切换分支"   # 把未提交的改动收起来
git stash list
git stash pop                     # 恢复并删除最近一条
```

## 分支与合并策略

```bash
git switch main
git merge feat/search             # 保留完整分支历史
# 或：在功能分支上先 git rebase main，再快进合并，历史是一条直线
```

- **merge** 不改已有提交，安全但历史会有分叉；**rebase** 把提交「重放」到新的基底上，历史干净但会改写提交哈希。
- 铁律：**不要 rebase 已经推送到公共分支的提交**。
- 合并冲突时别慌：看 `<<<<<<<` 到 `>>>>>>>` 之间的两段内容，决定保留哪边或重新整合，再 `git add` + `git commit`。

## 容易踩的坑

- **在 main 上直接开发**：临时试验也应该开分支，哪怕只活十分钟。
- **`git add .` 一把梭**：容易把 `.env`、构建产物、调试日志一起提交。用 `.gitignore` 兜底，提交前看 `git diff --staged`。
- **把密钥提交进仓库**：删掉再提交**不算清理**，历史里仍然能翻出来，需要轮换密钥，必要时用 `git filter-repo` 重写历史。
- **`pull` 产生大量 merge commit**：团队里统一用 `git pull --rebase` 或配置 `pull.rebase true`。
- **`--force` 推共享分支**：用 `--force-with-lease` 更安全，它会在远端被别人更新过时拒绝。
- **只看 `git log` 不看图**：复杂分叉下加 `--graph --all` 才看得清谁从哪来。

## 参考

依据 [菜鸟教程 · Git 教程](https://www.runoob.com/git/git-tutorial.html) 的章节脉络（工作流程、工作区/暂存区/版本库、创建仓库、基本操作、分支管理、提交历史、标签）整理，并补充了现代 `switch` / `restore` 写法。本文为要点归纳与自写示例。
