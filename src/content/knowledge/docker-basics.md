---
title: 'Docker 镜像、容器与常用命令速查'
description: '镜像 / 容器 / 卷三者的关系，一页命令表，以及写 Dockerfile 时最容易留下大坑的几处。'
pubDate: 2026-11-09
category: '工程实践'
tags: ['工具', 'Docker', '部署']
pinned: false
draft: false
---

Docker 解决的是「在我机器上能跑」：把代码、运行时、系统依赖一起打成**镜像**，再用镜像启动相互隔离的**容器**。理解这三个对象的生命周期，命令就不用死记了。

## 三个核心对象

| 对象 | 是什么 | 生命周期 | 类比 |
| --- | --- | --- | --- |
| 镜像 Image | 只读的分层文件包 | 构建后基本不变 | 安装包 / 类 |
| 容器 Container | 镜像加一层可写层跑起来的进程 | 可随时删掉重建 | 运行中的实例 / 对象 |
| 卷 Volume | 由 Docker 管理的持久化目录 | 独立于容器 | 外接硬盘 |
| 网络 Network | 容器间通信的隔离网段 | 独立于容器 | 虚拟交换机 |

关键推论：**容器不该存状态**。删掉容器重建是正常操作，凡是「删了就丢」的数据都要放进卷或外部服务。

## 命令速查

```bash
# 镜像
docker images                          # 列出本地镜像
docker pull node:22-alpine             # 拉取
docker build -t my-app:1.0 .           # 用当前目录的 Dockerfile 构建
docker rmi my-app:1.0                  # 删除镜像

# 容器
docker run -d --name web -p 8080:80 -v app-data:/data --restart unless-stopped my-app:1.0
docker ps -a                           # 含已停止的容器
docker logs -f --tail 100 web         # 跟日志
docker exec -it web sh                # 进容器排查（不是长期改配置的地方）
docker stop web && docker rm web      # 停并删

# 清理
docker system df                      # 看看空间被谁占了
docker system prune                   # 清掉未被使用的构建缓存等（会删数据，先看提示）
```

| 常用参数 | 作用 |
| --- | --- |
| `-d` | 后台运行 |
| `-p 宿主:容器` | 端口映射 |
| `-v 卷名:容器路径` | 挂载卷；也可写 `-v $(pwd):/app` 做本地开发挂载 |
| `-e KEY=value` / `--env-file` | 注入环境变量 |
| `--network` | 加入指定网络，同网络内容器可用服务名互访 |
| `--restart` | 重启策略，如 `unless-stopped` |
| `--rm` | 退出即删除，适合一次性任务 |

## Dockerfile 与 Compose

```dockerfile
FROM node:22-alpine
WORKDIR /app

# 先只拷依赖清单，命中缓存后不必每次重装
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

分层缓存按「指令从上往下，某一层变了，其后全部重建」。所以把**变化少的放前面、变化频繁的放后面**，构建速度差别非常大。再配一份 `.dockerignore` 把 `node_modules`、`.git`、构建产物排除，否则上下文会把几百 MB 传给 daemon。

```yaml
services:
  web:
    build: .
    ports:
      - "8080:3000"
    environment:
      NODE_ENV: production
    volumes:
      - app-data:/data
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  app-data:
  db-data:
```

`depends_on` 只保证**启动顺序**，不保证数据库已经能接受连接；应用仍要有重试或健康检查。

## 容易踩的坑

- **在容器里改配置**：容器一删就回到初始状态，配置要进镜像、环境变量或卷。
- **用 `latest` 标签上生产**：同一行配置哪天拉到什么版本不可控，固定主版本或摘要（digest）。
- **把密钥写进镜像**：`ARG` / `ENV` 会留在镜像历史和 `docker inspect` 里，改用运行时注入或密钥管理。
- **`COPY . .` 之前没有 `.dockerignore`**：本地 `node_modules` 被拷进去，覆盖掉镜像里装好的依赖，还把镜像撑大。
- **以 root 运行进程**：挂载宿主目录时权限风险被放大，镜像里建个非 root 用户再 `USER` 切换。
- **`docker system prune -a` 当成日常清理**：会删掉所有未被容器引用的镜像，先看清提示再执行。
- **日志全写进容器文件**：容器被重建就没了，交给 stdout / stderr，让 `docker logs` 或日志驱动统一收集。
- **多个容器用 `localhost` 互访**：每个容器有自己的网络命名空间，Compose 里要用服务名（如 `db`）。

## 参考

依据 [菜鸟教程 · Docker 教程](https://www.runoob.com/docker/docker-tutorial.html) 与 [Docker 镜像使用](https://www.runoob.com/docker/docker-image-usage.html) 的知识脉络（镜像、容器、Dockerfile）整理。本文为要点归纳与自写示例，命令参数以本机 Docker 版本的 `docker help` 为准。
