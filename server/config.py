"""配置模块 - 飞牛图书系统配置"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """系统配置"""

    # 应用配置
    APP_NAME: str = "飞牛图书"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 数据库配置
    DATABASE_URL: str = f"sqlite:///{Path(__file__).parent.parent / 'data' / 'books.db'}"

    # JWT 配置
    SECRET_KEY: str = "flying-cow-books-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # 文件存储配置
    BOOKS_DIR: Path = Path(__file__).parent.parent / "data" / "books"
    COVERS_DIR: Path = Path(__file__).parent.parent / "data" / "covers"
    MAX_UPLOAD_SIZE: int = 500 * 1024 * 1024  # 500MB

    # 允许的电子书格式
    ALLOWED_FORMATS: set = {"epub", "pdf", "mobi", "azw3", "txt"}

    # OPDS 配置
    OPDS_TITLE: str = "飞牛图书家庭书库"
    OPDS_AUTHOR: str = "Flying Cow Books"
    OPDS_PAGE_SIZE: int = 50

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# 确保数据目录存在
settings.BOOKS_DIR.mkdir(parents=True, exist_ok=True)
settings.COVERS_DIR.mkdir(parents=True, exist_ok=True)
Path(settings.DATABASE_URL.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
