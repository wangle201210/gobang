# P2P 五子棋

一个基于 WebRTC 的 P2P 五子棋游戏，无需服务器即可与朋友对战。

## 功能特点

- **P2P 对战**：基于 PeerJS (WebRTC) 实现，玩家之间直接连接
- **房间系统**：创建房间后分享链接，朋友打开即可加入
- **观战模式**：支持多人观战，观战者可实时观看对局
- **让位功能**：对战玩家可以让位给观战者
- **身份持久化**：刷新页面后自动恢复身份和角色
- **响应式设计**：支持手机和电脑端

## 技术栈

- Vue 3 + Composition API
- PeerJS (WebRTC)
- Tailwind CSS
- Element Plus
- Vite

## 本地开发

```bash
# 安装依赖
npm install

# 配置 TURN 服务器（可选，用于跨网络连接）
cp .env.example .env.local
# 编辑 .env.local 设置 VITE_TURN_URL

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 部署

### 方式一：Docker Compose（推荐）

包含前端和 TURN 服务器，支持跨网络对战：

```bash
# 设置服务器公网 IP 并启动
TURN_HOST=你的服务器IP docker compose up -d
```

需要开放端口：
- `8080` - 前端 Web 服务
- `3478/tcp` 和 `3478/udp` - TURN 服务器

### 方式二：仅前端

仅在局域网内使用：

```bash
# 使用预构建镜像
docker run -d -p 8080:80 iwangle/gobang:latest

# 或者自行构建（带 TURN 支持）
docker build --build-arg VITE_TURN_URL=turn:你的服务器IP:3478 -t gobang .
docker run -d -p 8080:80 gobang
```

访问 http://localhost:8080 即可使用。

## 使用说明

1. **创建房间**：点击"创建新房间"，成为房主（黑方）
2. **邀请好友**：复制分享链接发送给朋友
3. **加入房间**：打开链接或输入房间号加入
4. **开始对战**：双方就位后即可开始下棋
5. **观战**：房间已有两名玩家时，新加入者自动成为观众
6. **让位**：玩家可点击观众名字，让出位置

## 注意事项

- 需要浏览器支持 WebRTC
- 跨网络对战需要部署 TURN 服务器（见 Docker Compose 部署方式）
- 局域网内可直接使用，无需 TURN 服务器
- 房主刷新页面后，其他玩家会自动尝试重连
- 建议使用现代浏览器（Chrome、Firefox、Safari、Edge）

## License

MIT
