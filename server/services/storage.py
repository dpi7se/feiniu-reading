"""文件存储服务 - 电子书文件管理"""
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from config import settings


def save_book_file(file_data: bytes, filename: str, book_id: int) -> str:
    """保存电子书文件，返回相对路径"""
    ext = Path(filename).suffix.lower()
    # 以 book_id 命名，避免冲突
    saved_name = f"{book_id}{ext}"
    file_path = settings.BOOKS_DIR / saved_name

    with open(file_path, "wb") as f:
        f.write(file_data)

    # 返回相对 data 目录的路径
    return str(file_path.relative_to(settings.BOOKS_DIR.parent))


def save_cover(image_data: bytes, book_id: int, ext: str = ".jpg") -> str:
    """保存封面图片，返回相对路径"""
    saved_name = f"{book_id}{ext}"
    file_path = settings.COVERS_DIR / saved_name

    with open(file_path, "wb") as f:
        f.write(image_data)

    return str(file_path.relative_to(settings.COVERS_DIR.parent))


def delete_file(relative_path: str):
    """删除文件（如果存在）"""
    try:
        full_path = settings.BOOKS_DIR.parent / relative_path
        if full_path.exists():
            full_path.unlink()
    except Exception:
        pass


def get_file_path(relative_path: str) -> Path:
    """获取文件绝对路径"""
    return settings.BOOKS_DIR.parent / relative_path


def get_file_size(relative_path: str) -> int:
    """获取文件大小"""
    try:
        return get_file_path(relative_path).stat().st_size
    except Exception:
        return 0


def file_exists(relative_path: str) -> bool:
    """检查文件是否存在"""
    return get_file_path(relative_path).exists()


def get_format_from_filename(filename: str) -> str:
    """从文件名提取格式"""
    return Path(filename).suffix.lower().lstrip(".")
