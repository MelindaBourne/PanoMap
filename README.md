# PanoMap · 全景地图

**PanoMap** 是一款基于高德地图与 Pannellum 的全景照片展示 Web 应用，支持移动端，可以直接部署为 GitHub Pages。

---

## ✨ 功能列表

| 功能 | 说明 |
|---|---|
| 用户注册 / 登录 / 退出 | PBKDF2-SHA256 密码哈希，localStorage 会话持久化 |
| 全景照片上传 | 拖拽或点击上传图片，地图选点定位，自动生成缩略图 |
| 地图展示 | 高德地图 2.0，缩略图标记，点击进入全景模式 |
| 全景查看器 | Pannellum 等角投影，鼠标滚轮缩放，拖拽旋转，退出按钮 |
| 侧边栏 | 全景照片分组展示，可收起，点击定位，支持编辑 / 删除 |
| 搜索 | 实时关键字搜索，支持名称 / 分组 / 描述匹配，点击飞到位置 |
| 权限控制 | 只有上传者可编辑 / 删除自己的照片 |
| 移动端适配 | 响应式布局，侧边栏滑出抽屉，触屏全景操作 |

## 🚀 快速开始

### 本地预览

```bash
# 任意静态服务器即可，例如：
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

**演示账户：** 用户名 `demo`，密码 `demo123`

### GitHub Pages 部署

1. Fork 本仓库
2. 进入 **Settings → Pages** → Source 选择 `main` 分支
3. 访问 `https://<你的用户名>.github.io/PanoMap/`

### 高德地图 API Key

项目已内置 API Key（`1ae1b4a6c27c553d76869aa1ec4c440f`）。  
建议在 [高德开放平台控制台](https://console.amap.com) 为该 Key 绑定您的域名白名单，防止未授权调用。

## 🛠 技术栈

- **高德地图 2.0** — 主地图底图 + 小地图选点 + 地址自动补全 + GPS 定位  
- **Pannellum 2.5** — 等角投影 360° 全景渲染  
- **Web Crypto API** — PBKDF2-SHA256 密码哈希（客户端）  
- **IndexedDB** — 全景图片 Blob 本地存储  
- **localStorage** — 用户账户 + 全景元数据持久化  
- **原生 HTML / CSS / JavaScript** — 零框架依赖，可直接部署为静态页面

## 📁 目录结构

```
PanoMap/
├── index.html          # 应用主页（含所有 HTML 结构）
├── css/
│   └── style.css       # 全量样式（响应式 + 动画）
└── js/
    ├── config.js       # 配置常量（API Key、IndexedDB 名称等）
    ├── db.js           # 存储层（IndexedDB + localStorage）
    ├── auth.js         # 认证（PBKDF2 哈希、注册/登录/退出）
    ├── panorama.js     # Pannellum 全景查看器封装
    ├── map.js          # 高德地图模块（标记、迷你地图、GPS）
    └── app.js          # 主控制器（上传、侧边栏、搜索、编辑/删除）
```
