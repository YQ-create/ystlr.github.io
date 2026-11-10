---
title: 'Shell 脚本基础速查'
description: '变量、引号、判断、循环与退出码：把「能跑」的命令行拼成「出错也靠谱」的脚本。'
pubDate: 2026-11-09
category: '工程实践'
tags: ['进阶', '工具']
pinned: false
draft: false
---

Shell 脚本最容易出事的地方不是语法，而是**引号和退出码**：一个没加引号的变量在路径含空格时炸开，一个没检查的返回值让脚本在失败后继续往下跑。先把这两件事立规矩，其余都是查表。

## 变量与引号

```bash
#!/usr/bin/env bash
set -euo pipefail   # 出错即停 / 未定义变量报错 / 管道任一环失败即失败

name="ystlr"
dir="/tmp/my project"
echo "Hello, $name"          # 双引号：会展开变量
echo 'literal $name'         # 单引号：原样输出
echo "${name}_backup"        # 花括号界定变量名边界
mkdir -p "$dir"              # 必须加引号，否则 mkdir 收到两个参数
printf '%s\n' "${PATH//:/$'\n'}"   # 参数展开
```

| 写法 | 含义 |
| --- | --- |
| `$var` / `${var}` | 取变量值 |
| `${var:-default}` | 未设置或为空时用默认值 |
| `${var:?message}` | 未设置就报错退出（适合必填配置） |
| `$(cmd)` | 命令替换，取输出（**别用反引号**） |
| `$(( 1 + 2 ))` | 整数运算 |
| `"$@"` | 原样保留所有参数（含空格） |
| `$#` / `$?` / `$$` | 参数个数 / 上条命令退出码 / 当前 PID |

`set -euo pipefail` 值得写进几乎每个脚本：`-e` 遇错停、`-u` 打错变量名立刻报、`pipefail` 让 `cmd | grep` 里 `cmd` 的失败不再被吞掉。

## 判断、循环与函数

```bash
if [[ -f "$file" && -s "$file" ]]; then
  echo "文件存在且非空"
elif [[ -d "$file" ]]; then
  echo "是目录"
else
  echo "缺失" >&2
  exit 1
fi

for f in *.md; do
  [[ -e "$f" ]] || continue       # 没匹配到时通配符不展开
  echo "处理 $f"
done

while IFS= read -r line; do
  printf '行: %s\n' "$line"
done < list.txt

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
```

| 测试 | 含义 |
| --- | --- |
| `-e` / `-f` / `-d` | 存在 / 是普通文件 / 是目录 |
| `-s` / `-r` / `-x` | 非空 / 可读 / 可执行 |
| `-z` / `-n` | 字符串为空 / 非空 |
| `==` `!=` `=~` | 字符串相等 / 不等 / 正则匹配 |
| `-eq` `-lt` `-gt` | 数值比较 |

用 `[[ ... ]]` 而不是 `[ ... ]`：前者支持正则、不会因空变量导致语法错误，行为更可预测。

## 管道、重定向与退出码

```bash
cmd > out.log 2> err.log        # 分开标准输出与错误
cmd > all.log 2>&1              # 合并
cmd >> append.log               # 追加
cmd1 | cmd2 && echo "都成功" || echo "有失败" >&2
grep -q 'ERROR' app.log; echo "grep 退出码: $?"   # 0 找到 / 1 没找到 / 2 出错
```

| 符号 | 作用 |
| --- | --- |
| `&&` / `\|\|` | 前一条成功 / 失败时才执行 |
| `;` | 无条件顺序执行 |
| `&` | 放后台（脚本结束前记得 `wait`） |
| `2>&1` | 把 stderr 并入 stdout |
| `trap 'cleanup' EXIT` | 退出时统一清理临时文件 |

**退出码 0 才是成功**。`grep -q` 找不到返回 1，不等于「命令出错」；在 `set -e` 下要用 `if grep -q ...; then` 或 `grep -q ... || true` 明确表达这个预期。

## 容易踩的坑

- **变量不加引号**：`rm -rf $dir` 在 `dir` 含空格或为空时会变成灾难；一律 `"$dir"`。
- **用反引号做命令替换**：嵌套时转义地狱，改 `$(...)`。
- **`set -e` 在管道里失效**：没有 `pipefail` 时 `false | true` 仍算成功。
- **把 `$?` 存晚了**：中间任何一条 `echo` 都会覆盖它，需要就立刻赋值。
- **用 `ls` 的输出做循环**：文件名含空格/换行会被拆开，用 glob 或 `find -print0`。
- **`while read` 少了 `-r`**：反斜杠被吃掉，路径和转义文本会变形。
- **脚本开头不写 shebang / 不设 `IFS`**：不同环境用不同 shell 解析，行为飘忽。
- **`cd` 不检查返回值**：目录不存在时后续命令会在错误位置执行，用 `cd "$dir" || exit 1`。
- **在脚本里放明文密钥**：会进版本库与进程列表，用环境变量或密钥文件并限制权限。

## 参考

依据 [菜鸟教程 · Shell 教程](https://www.runoob.com/linux/linux-shell.html) 与 [Linux 教程](https://www.runoob.com/linux/linux-tutorial.html) 的知识脉络（变量、判断、循环）整理。本文为要点归纳与自写示例，常用命令可对照本知识库的《Linux 常用命令速查》。
