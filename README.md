# 飞牛阅读 · 家庭读书数据中心

> 家庭读书数据中心 - 电子书仓库与开放 API

![GitHub](https://img.shields.io/github/license/dpi7se/feiniu-reading)
![GitHub last commit](https://img.shields.io/github/last-commit/dpi7se/feiniu-reading)

## 📖 项目简介

飞牛阅读是一个家庭读书数据中心，旨在将散落在不同设备和 App 中的电子书、阅读进度、笔记集中管理，构建"家庭读书大脑"。通过标准化处理与开放 API，让其他阅读软件能安全地读取或更新阅读数据，实现跨设备无缝阅读体验。

**核心链路**: 家庭读书数据中心 → 数据集中管理 → 标准化输出 → API 接口 → 实际应用

## ✨ 功能特性

### 📚 图书管理
- **多格式支持**: EPUB、PDF、MOBI、AZW3、TXT 等主流格式
- **自动刮削**: 上传电子书后自动提取元数据（书名、作者、ISBN、封面等）
- **分类管理**: 多级树形分类，支持批量归类
- **文件管理**: 上传、下载、删除图书文件

### 👥 用户系统
- **多用户支持**: 家庭共享图书库，独立阅读进度
- **JWT 认证**: 安全的用户登录与权限管理
- **默认管理员**: `admin/admin123`

### 📊 阅读进度
- **跨设备同步**: 记录阅读进度，支持多设备切换
- **阅读统计**: 总阅读时长、最后阅读时间
- **进度追踪**: 当前页码、章节、阅读百分比

### 📝 笔记管理
- **笔记记录**: 支持按图书分组、高亮内容、章节标记
- **笔记编辑**: 创建、修改、删除笔记
- **笔记导出**: 支持查看和管理所有笔记

### 🌐 API 接口
- **RESTful API**: 标准化的 HTTP 接口
- **OPDS 协议**: 支持阅读器软件（Marvin、KyBook、Moon+Reader 等）发现和下载图书
- **Swagger 文档**: 自动生成的 API 文档

### 🚀 部署方式
- **Windows**: 一键启动脚本 `start.bat`
- **Linux/NAS**: 启动脚本 `start.sh`
- **Docker**: Docker Compose 部署支持

## 🛠️ 技术栈

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 后端 | FastAPI (Python 3.11+) | 高性能异步框架 |
| 数据库 | SQLite | 文件型数据库，适合 NAS 场景 |
| 前端 | HTML5 + JavaScript (原生) | 无框架依赖，部署简单 |
| ORM | SQLAlchemy 2.0 | 类型安全的数据访问 |
| 电子书处理 | ebooklib, PyPDF2, mobimeta | 多格式元数据提取 |
| API 协议 | RESTful + OPDS 1.2 | 标准化输出与行业协议 |
| 认证 | JWT | 用户身份验证 |

## 📁 项目结构

```
feiniu-reading/
├── server/                    # 后端 FastAPI 服务
│   ├── app.py                 # 主程序入口
│   ├── config.py              # 配置管理
│   ├── database.py            # 数据库连接
│   ├── models.py              # SQLAlchemy 数据模型
│   ├── schemas.py             # Pydantic 数据验证
│   ├── auth.py                # JWT 认证模块
│   ├── routers/               # API 路由模块
│   │   ├── auth.py            # 认证与用户路由
│   │   ├── books.py           # 图书 CRUD 路由
│   │   ├── progress.py        # 阅读进度路由
│   │   ├── notes.py           # 笔记路由
│   │   ├── categories.py      # 分类路由
│   │   └── opds.py            # OPDS 协议路由
│   ├── services/              # 业务服务层
│   │   ├── scraper.py         # 图书刮削服务
│   │   └── storage.py         # 文件存储服务
│   └── requirements.txt       # Python 依赖
├── web/                       # 前端页面
│   ├── index.html             # 主页面结构
│   ├── styles.css             # 样式文件
│   └── app.js                 # 应用逻辑
├── Dockerfile                 # Docker 镜像配置
├── docker-compose.yml         # Docker Compose 部署
├── start.bat                  # Windows 启动脚本
├── start.sh                   # Linux/NAS 启动脚本
├── .gitignore                 # Git 忽略文件
└── .dockerignore              # Docker 忽略文件
```

## 🚀 快速开始

### 环境要求

- Python 3.11+
- Windows / Linux / NAS

### 方式一：一键启动（推荐）

**Windows**:
```bash
# 双击 start.bat 或在命令行执行
start.bat
```

**Linux/NAS**:
```bash
chmod +x start.sh
./start.sh
```

### 方式二：手动启动

```bash
# 进入项目目录
cd feiniu-reading

# 创建虚拟环境（推荐）
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate.bat  # Windows

# 安装依赖
pip install -r server/requirements.txt

# 启动服务
cd server
python app.py
```

### 方式三：Docker Compose

```bash
# 创建环境变量文件
echo 'NAS_BOOKS_PATH=/path/to/your/books' > .env

# 启动容器
docker-compose up -d
```

## 🔗 访问地址

| 服务 | 地址 |
|------|------|
| 系统首页 | http://localhost:8000 |
| API 文档 | http://localhost:8000/api/docs |
| 健康检查 | http://localhost:8000/api/health |
| OPDS 目录 | http://localhost:8000/opds/v1.2/catalog |

## 🔐 默认账号

- **用户名**: `admin`
- **密码**: `admin123`

> **安全提醒**: 首次登录后请修改默认密码！

## 📡 API 接口

### 用户认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 用户注册 |
| GET | `/api/users/me` | 获取当前用户 |
| PUT | `/api/users/me` | 更新用户信息 |

### 图书管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 获取图书列表 |
| POST | `/api/books` | 上传图书 |
| GET | `/api/books/{id}` | 获取图书详情 |
| PUT | `/api/books/{id}` | 更新图书信息 |
| DELETE | `/api/books/{id}` | 删除图书 |
| GET | `/api/books/{id}/cover` | 获取图书封面 |
| GET | `/api/books/{id}/download` | 下载图书文件 |

### 阅读进度

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/progress` | 获取阅读进度列表 |
| GET | `/api/progress/{book_id}` | 获取指定图书进度 |
| PUT | `/api/progress/{book_id}` | 更新阅读进度 |
| DELETE | `/api/progress/{book_id}` | 删除阅读进度 |

### 笔记管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 获取笔记列表 |
| POST | `/api/notes` | 创建笔记 |
| PUT | `/api/notes/{id}` | 更新笔记 |
| DELETE | `/api/notes/{id}` | 删除笔记 |

### 分类管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取分类树 |
| POST | `/api/categories` | 创建分类 |
| PUT | `/api/categories/{id}` | 更新分类 |
| DELETE | `/api/categories/{id}` | 删除分类 |

## 📖 OPDS 协议

飞牛阅读支持 OPDS 1.2 协议，可被以下阅读器软件发现和使用：

- Marvin (iOS)
- KyBook (iOS)
- Moon+ Reader (Android)
- Aldiko (Android)
- Librera Reader (Android)
- Cool Reader (Android)
- FBReader (跨平台)

**OPDS 接口**:
- 目录根: `/opds/v1.2/catalog`
- 图书列表: `/opds/v1.2/books`
- 分类列表: `/opds/v1.2/categories`
- 搜索: `/opds/v1.2/search?q=关键词`

## ⚙️ 配置说明

配置文件位于 `server/config.py`，支持通过环境变量覆盖：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `HOST` | `0.0.0.0` | 绑定地址 |
| `PORT` | `8000` | 端口号 |
| `DEBUG` | `true` | 调试模式 |
| `DATABASE_URL` | `sqlite:///data/books.db` | 数据库路径 |
| `SECRET_KEY` | 随机生成 | JWT 密钥 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Token 有效期（分钟） |
| `MAX_UPLOAD_SIZE` | `524288000` | 最大上传大小（500MB） |

## 📦 数据存储

```
data/
├── books.db          # SQLite 数据库文件
├── books/            # 电子书文件存储目录
└── covers/           # 封面图片存储目录
```

## 🛡️ 安全

- JWT 令牌认证
- 密码使用 bcrypt 哈希存储
- 文件上传格式验证
- SQL 注入防护（SQLAlchemy ORM）
- CORS 跨域配置

## 📝 开发指南

### 启动开发服务器

```bash
cd server
python app.py --reload
```

### 数据库迁移

```bash
# 删除旧数据库，重启应用会自动重建
rm data/books.db
python app.py
```

### 新增功能

1. 在 `server/models.py` 添加数据模型
2. 在 `server/schemas.py` 添加 Pydantic Schema
3. 在 `server/routers/` 创建新路由文件
4. 在 `server/app.py` 注册新路由

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系

如有问题或建议，请在 GitHub 上提交 Issue。

---

**飞牛阅读** - 让阅读更美好 🌟
