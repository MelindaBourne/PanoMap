# PanoMap — 全景照片地图展示平台

一个基于 Web 的全景照片地图展示应用，使用**高德地图**进行地理定位，支持全景照片的上传、展示和管理。

![PanoMap Screenshot](https://via.placeholder.com/800x400?text=PanoMap+Preview)

## ✨ 功能特性

- 🗺️ **地图展示** — 全景照片以缩略图标记显示在高德地图上，支持标准/卫星视图切换
- 🔭 **全景查看** — 点击标记进入全景模式，支持鼠标拖拽旋转、滚轮缩放
- 📤 **照片上传** — 登录用户可上传全景照片，在地图上选取拍摄位置
- 👤 **用户账户** — 注册/登录系统，上传/删除权限与账户关联
- 📁 **分组管理** — 照片支持创建分组，侧边栏按分组折叠展示
- 🔍 **搜索功能** — 实时搜索全景照片名称和描述
- 📋 **侧边栏** — 可收起的侧边栏，显示所有照片列表，支持快速定位
- 🗑️ **权限控制** — 仅照片上传者可删除自己的照片

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML5 + CSS3 + JavaScript (ES6+) |
| 后端 | Node.js + Express.js |
| 数据库 | SQLite (sqlite3 + sqlite) |
| 地图 | 高德地图 JS API 2.0 |
| 全景查看 | Pannellum 2.5 |
| 认证 | JWT + bcryptjs |
| 文件处理 | Multer + Sharp (缩略图生成) |

## 🚀 快速开始

### 前提条件

- Node.js 16+
- npm 7+
- 高德地图 API Key（[申请地址](https://lbs.amap.com/)）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/MelindaBourne/PanoMap.git
cd PanoMap

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的高德地图 API Key 和 JWT 密钥
```

### 配置文件 (`.env`)

```env
PORT=3000
AMAP_API_KEY=你的高德地图API密钥
JWT_SECRET=自定义一个安全的随机字符串
```

### 启动服务

```bash
# 生产模式
npm start

# 开发模式（热重载）
npm run dev
```

访问 `http://localhost:3000` 即可使用。

## 📁 项目结构

```
PanoMap/
├── server.js              # Express 服务器入口
├── database.js            # SQLite 数据库初始化
├── middleware/
│   └── auth.js            # JWT 认证中间件
├── routes/
│   ├── auth.js            # 认证路由 (注册/登录)
│   ├── photos.js          # 照片 CRUD 路由
│   └── groups.js          # 分组管理路由
├── public/
│   ├── index.html         # 主页面（地图+侧边栏）
│   ├── login.html         # 登录/注册页面
│   ├── css/
│   │   └── style.css      # 全局样式
│   └── js/
│       └── app.js         # 前端应用逻辑
├── uploads/               # 上传文件目录（gitignored）
│   ├── originals/         # 原始全景照片
│   └── thumbnails/        # 生成的缩略图
├── data/                  # SQLite 数据库文件（gitignored）
├── .env.example           # 环境变量示例
└── package.json
```

## 🔌 API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册新用户 |
| POST | `/api/auth/login` | 用户登录 |
| GET  | `/api/auth/me` | 获取当前用户信息 |

### 照片

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET  | `/api/photos` | 获取所有照片（支持搜索/过滤） | 公开 |
| GET  | `/api/photos/:id` | 获取单张照片详情 | 公开 |
| POST | `/api/photos` | 上传全景照片 | 需登录 |
| PUT  | `/api/photos/:id` | 更新照片信息 | 仅本人 |
| DELETE | `/api/photos/:id` | 删除照片 | 仅本人 |

### 分组

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET  | `/api/groups` | 获取所有分组 | 公开 |
| POST | `/api/groups` | 创建分组 | 需登录 |
| PUT  | `/api/groups/:id` | 更新分组 | 仅本人 |
| DELETE | `/api/groups/:id` | 删除分组 | 仅本人 |

## 🗺️ 使用说明

### 上传全景照片

1. 注册账户并登录
2. 点击顶部导航栏的「上传全景」按钮
3. 选择全景照片文件（JPG/PNG/WebP，最大 50MB）
4. 填写照片名称和描述
5. 在位置选择地图上点击选取拍摄位置
6. 可选择所属分组
7. 点击「上传照片」

### 查看全景照片

- 点击地图上的缩略图标记，在弹出详情中点击「查看全景」
- 或点击侧边栏照片列表中的全景图标
- 全景模式下：拖动鼠标旋转视角，滚轮缩放
- 点击左上角「退出全景」按钮返回地图

### 管理照片

- 点击右上角用户名 → 「管理分组」创建/删除分组
- 侧边栏照片列表中，鼠标悬停显示删除按钮（仅本人）
- 支持按分组和关键词搜索过滤

## 📝 开发计划

- [ ] 支持批量上传
- [ ] 照片评论功能
- [ ] 照片浏览量统计展示
- [ ] 分享链接生成
- [ ] 移动端优化
- [ ] 照片 EXIF 信息自动提取位置

## 📄 许可证

MIT License