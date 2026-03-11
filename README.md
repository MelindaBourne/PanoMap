# PanoMap — 全景地图展示平台

一款基于高德地图（Amap）的全景照片 Web 展示系统，支持用户登录、全景照片上传与地图定位，提供流畅的 360° 全景浏览体验。

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 用户账户 | 注册 / 登录 / 退出，JWT 认证 |
| 🗺️ 地图展示 | 高德地图，全景照片以缩略图标记显示 |
| 🌐 全景浏览 | 点击标记进入 Pannellum 360° 全景模式，支持鼠标缩放/平移/拖拽，全屏 |
| 📤 上传照片 | 拖拽 / 点击上传 JPG / PNG / WebP，设置标题、分组、描述，地图选点定位 |
| 📋 侧边栏 | 按分组折叠显示所有全景照片，可收起侧边栏；点击定位到地图位置 |
| 🔍 搜索 | 实时搜索过滤地图标记与侧边栏列表 |
| 🗑️ 删除 | 登录用户只能删除自己上传的照片 |

---

## 技术栈

- **后端**：Node.js + Express + better-sqlite3 + Multer + bcryptjs + jsonwebtoken
- **前端**：原生 HTML / CSS / JavaScript（无框架依赖）
- **地图**：[高德地图 JSAPI 2.0](https://lbs.amap.com/api/jsapi-v2/summary)
- **全景查看**：[Pannellum](https://pannellum.org/)（CDN）
- **数据库**：SQLite（文件级，无需安装数据库服务）
- **缩略图**：可选 `sharp` 模块自动生成，不安装时使用原图

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/MelindaBourne/PanoMap.git
cd PanoMap
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制示例配置文件并填写你的高德 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
AMAP_API_KEY=your_amap_api_key_here   # 在 https://lbs.amap.com/ 申请
JWT_SECRET=change-this-to-a-strong-random-secret
PORT=3000
```

> **获取高德 API Key**：访问 [高德开放平台](https://lbs.amap.com/)，注册账号后在「控制台 → 应用管理 → 创建应用」中申请 **Web 端（JSAPI）** 类型的 Key。

### 4. 启动服务

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)

---

## 目录结构

```
PanoMap/
├── server.js          # Express 后端（API + 静态资源）
├── package.json
├── .env.example       # 环境变量示例
├── .gitignore
├── data/              # SQLite 数据库（自动创建，已 gitignore）
├── uploads/           # 上传的全景图片（自动创建，已 gitignore）
│   └── thumbnails/    # 自动生成的缩略图
└── public/
    ├── index.html     # 单页应用入口
    ├── css/
    │   └── style.css  # 全局样式
    └── js/
        └── app.js     # 前端应用逻辑
```

---

## API 接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 | - |
| `POST` | `/api/auth/login`    | 用户登录 | - |
| `GET`  | `/api/config`        | 获取前端配置（地图 Key） | - |
| `GET`  | `/api/panoramas`     | 获取全部全景照片 | - |
| `GET`  | `/api/panoramas/:id` | 获取单个全景照片 | - |
| `POST` | `/api/panoramas`     | 上传全景照片 | ✅ JWT |
| `DELETE` | `/api/panoramas/:id` | 删除全景照片（仅限本人） | ✅ JWT |

---

## 可选依赖

安装 `sharp` 可自动生成上传图片的缩略图（优化地图标记加载速度）：

```bash
npm install sharp
```

不安装也完全可用，此时地图标记会直接加载原图（需要等待较大的图片文件）。

---

## 许可证

MIT
