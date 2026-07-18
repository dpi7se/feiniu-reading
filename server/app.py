"""飞牛图书 · 家庭读书数据中心 - FastAPI 主程序"""
import os
import sys
from pathlib import Path

# 将 server 目录加入 Python 路径，确保模块导入正常
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db, SessionLocal
from auth import init_default_admin
from routers.auth import auth_router, users_router
from routers.books import router as books_router
from routers.progress import router as progress_router
from routers.notes import router as notes_router
from routers.categories import router as categories_router
from routers.opds import router as opds_router


# ==================== 创建应用 ====================
app = FastAPI(
    title=settings.APP_NAME,
    description="家庭读书数据中心 - 电子书仓库与开放 API",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ==================== 中间件 ====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 启动事件 ====================
@app.on_event("startup")
def on_startup():
    """应用启动时初始化"""
    # 创建数据目录
    settings.BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    settings.COVERS_DIR.mkdir(parents=True, exist_ok=True)

    # 初始化数据库
    init_db()
    print(f"[启动] 数据库已初始化: {settings.DATABASE_URL}")

    # 初始化默认管理员
    db = SessionLocal()
    try:
        init_default_admin(db)
        print("[启动] 默认管理员账户已就绪 (admin/admin123)")
    finally:
        db.close()

    print(f"[启动] {settings.APP_NAME} v{settings.APP_VERSION} 启动成功")
    print(f"[启动] 访问地址: http://{settings.HOST}:{settings.PORT}")
    print(f"[启动] API 文档: http://{settings.HOST}:{settings.PORT}/api/docs")
    print(f"[启动] OPDS 目录: http://{settings.HOST}:{settings.PORT}/opds/v1.2/catalog")


# ==================== 注册 API 路由 ====================
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(books_router)
app.include_router(progress_router)
app.include_router(notes_router)
app.include_router(categories_router)
app.include_router(opds_router)


# ==================== 静态文件服务（前端） ====================
WEB_DIR = BASE_DIR.parent / "web"

if WEB_DIR.exists():
    # 挂载静态资源（CSS, JS）
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        """根路径返回前端首页"""
        return FileResponse(str(WEB_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """
        前端 SPA 路由兜底
        所有未匹配 API/OPDS 的路径都返回 index.html 或对应静态文件
        """
        # 如果是已注册的 API 路径，不处理（让 FastAPI 路由处理）
        if full_path.startswith(("api/", "opds/")):
            raise HTTPException(status_code=404, detail="Not Found")

        # 尝试返回对应静态文件
        file_path = WEB_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))

        # 其他路径返回 index.html（支持前端 hash 路由）
        index_path = WEB_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))

        raise HTTPException(status_code=404, detail="Not Found")
else:
    @app.get("/", include_in_schema=False)
    async def no_frontend():
        return JSONResponse(
            {
                "message": "前端文件未找到",
                "hint": f"请将前端文件放在 {WEB_DIR} 目录下",
                "api_docs": "/api/docs",
            }
        )


# ==================== 健康检查 ====================
@app.get("/api/health", tags=["系统"], summary="健康检查")
def health_check():
    """系统健康检查"""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# ==================== 入口 ====================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )
