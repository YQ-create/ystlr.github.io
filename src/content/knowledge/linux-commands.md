---
title: 'Linux 常用命令速查'
description: '文件操作、权限、查找、管道、进程与网络：服务器上真正天天敲的那些。'
pubDate: 2026-10-30
category: '工程实践'
tags: ['工具', 'Linux', '速查']
pinned: false
draft: false
---

Linux 命令不需要背全，先把「**在哪、有什么、谁在跑、谁占着端口**」这四件事查清楚，服务器上的多数问题都能定位。命令设计上偏爱「一个工具做一件事」，再用管道拼起来。

## 文件与目录

| 命令 | 作用 |
| --- | --- |
| `pwd` | 显示当前路径 |
| `ls -lah` | 列出文件（含隐藏文件、人类可读大小） |
| `cd -` | 回到上一个目录 |
| `mkdir -p a/b` | 递归创建目录 |
| `cp -r src/ dst/` | 递归复制 |
| `mv old new` | 移动 / 重命名 |
| `rm -ri dir/` | 交互式删除（**先确认路径**） |
| `touch file` | 创建空文件 / 更新时间戳 |
| `ln -s target link` | 创建软链接 |

`rm -rf` 是不可逆的，执行前先 `pwd` 再 `ls` 看一眼目标。更稳的习惯是先把要删的东西 `mv` 到一个临时目录，确认没问题再清理。

## 查看内容与查找

```bash
cat file              # 一次性输出（短文件）
less file             # 分页查看，/ 搜索，q 退出
head -n 20 file       # 前 20 行
tail -f app.log       # 实时跟随日志
wc -l file            # 统计行数

grep -rn "TODO" src/  # 递归搜索并显示行号
grep -i --include="*.ts" "fetch" .
find . -name "*.log" -mtime +7 -size +10M
```

`grep` 找**内容**，`find` 找**文件**。日志排查常用组合：

```bash
tail -n 500 app.log | grep "ERROR" | head -n 20
```

## 权限

```bash
ls -l file
# -rw-r--r--  1 user group  1024 Nov  9 10:00 file
chmod 644 file          # 属主可读写，其他人只读
chmod +x script.sh      # 加执行权限
chown user:group file   # 改属主与属组
```

`rwx` 对应读 / 写 / 执行，三组分别是属主、属组、其他人；数字是 `r=4, w=2, x=1` 相加。目录的 `x` 表示「能进入」，所以目录通常需要 `755` 而不是 `644`。权限问题优先用 `ls -l` 看，别一上来就 `sudo chmod 777`。

## 管道、重定向与进程

```bash
cmd > file        # 覆盖写入
cmd >> file       # 追加
cmd 2>&1          # 把错误输出并入标准输出
cmd1 | cmd2       # 前一个的输出作为后一个的输入
cmd &             # 放到后台
```

```bash
ps aux | grep node         # 找进程
top / htop                 # 实时资源占用
kill -TERM <pid>           # 温和退出；-9 是强杀，最后手段
lsof -i :8080              # 谁占着 8080 端口
df -h                      # 磁盘剩余
du -sh * | sort -h         # 当前目录下谁最大
free -h                    # 内存
```

「服务起不来」的常见顺序：`lsof -i :端口` 看是否被占 → `ps aux` 看进程是否还活着 → `tail -f` 看日志 → `df -h` 排除磁盘满。

## 网络与传输

```bash
curl -I https://example.com          # 只看响应头
curl -s -o /dev/null -w "%{http_code}\n" https://example.com
ping -c 4 example.com                # 连通性
dig example.com                      # DNS 解析
ssh user@host                        # 登录
scp file user@host:/path/            # 传文件
rsync -avz src/ user@host:/dst/      # 增量同步（比 scp 更适合反复传）
```

## 容易踩的坑

- **路径带空格不加引号**：会被拆成多个参数，路径一律用引号包住。
- **`>` 当成 `>>`**：一次重定向把日志清空了，排查前先确认命令。
- **用 `grep` 匹配到自己**：`ps aux | grep node` 常带出 grep 进程本身，可写 `grep "[n]ode"` 规避。
- **直接 `kill -9`**：不给进程清理资源与写回状态的机会，先用默认 `TERM`。
- **在 root 下长期操作**：误删影响面大，日常用普通账户 + 按需 `sudo`。
- **改了配置不验证语法**：`nginx -t`、`sshd -t` 这类检查要在重载服务之前跑。

## 参考

依据 [菜鸟教程 · Linux 教程](https://www.runoob.com/linux/linux-tutorial.html) 的知识脉络（文件与目录管理、文件内容查看、权限、磁盘、进程）整理，并补充了日常排障组合。本文为要点归纳与自写示例；不同发行版的包管理与服务管理命令（apt / yum / systemctl）请以对应系统文档为准。
