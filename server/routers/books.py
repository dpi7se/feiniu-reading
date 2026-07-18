"""图书路由 - 图书 CRUD、上传、下载、封面"""
import os
import math
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import Book, Category, book_categories
from schemas import BookResponse, BookUpdate, MessageResponse, PaginatedResponse
from auth import get_current_user
from models import User
from config import settings
from services.scraper import extract_metadata
from services import storage

router = APIRouter(prefix="/api/books", tags=["图书"])

ALLOWED_FORMATS = settings.ALLOWED_FORMATS


@router.get("", summary="获取图书列表")
def list_books(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    fmt: Optional[str] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取图书列表，支持分页、搜索、格式筛选、分类筛选"""
    query = db.query(Book)

    # 搜索（书名、作者、ISBN）
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Book.title.ilike(search_term),
                Book.author.ilike(search_term),
                Book.isbn.ilike(search_term),
            )
        )

    # 格式筛选
    if fmt:
        query = query.filter(Book.format == fmt.lower())

    # 分类筛选
    if category_id:
        query = query.join(book_categories).filter(book_categories.c.category_id == category_id)

    # 总数
    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    # 分页
    books = query.order_by(Book.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [BookResponse.model_validate(b).model_dump() for b in books],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("", response_model=BookResponse, summary="上传图书")
async def upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    category_ids: Optional[str] = Form(None),  # 逗号分隔的分类ID
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传电子书，自动刮削元数据"""
    # 校验文件格式
    filename = file.filename or "unknown.txt"
    fmt = storage.get_format_from_filename(filename)
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的格式: {fmt}，支持: {', '.join(ALLOWED_FORMATS)}",
        )

    # 读取文件内容
    file_data = await file.read()
    if len(file_data) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")

    # 先创建占位图书记录以获取 ID
    book = Book(
        title=title or Path(filename).stem,
        format=fmt,
        file_path="",  # 占位，后面更新
        size=len(file_data),
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    # 保存文件
    try:
        relative_path = storage.save_book_file(file_data, filename, book.id)
        book.file_path = relative_path

        # 刮削元数据
        abs_path = storage.get_file_path(relative_path)
        metadata = extract_metadata(str(abs_path), fmt)

        # 应用元数据（用户指定优先）
        if not title and metadata.get("title"):
            book.title = metadata["title"]
        elif title:
            book.title = title

        if not author and metadata.get("author"):
            book.author = metadata["author"]
        elif author:
            book.author = author

        if metadata.get("isbn"):
            book.isbn = metadata["isbn"]
        if metadata.get("publisher"):
            book.publisher = metadata["publisher"]
        if metadata.get("publish_date"):
            book.publish_date = metadata["publish_date"]
        if metadata.get("description"):
            book.description = metadata["description"]
        if metadata.get("language"):
            book.language = metadata["language"]
        if metadata.get("pages"):
            book.pages = metadata["pages"]

        # 保存封面
        cover_data = metadata.get("cover_data")
        if cover_data:
            cover_path = storage.save_cover(cover_data, book.id)
            book.cover = cover_path

        # 关联分类
        if category_ids:
            cat_ids = [int(c.strip()) for c in category_ids.split(",") if c.strip().isdigit()]
            for cid in cat_ids:
                category = db.query(Category).filter(Category.id == cid).first()
                if category:
                    book.categories.append(category)

        db.commit()
        db.refresh(book)
        return BookResponse.model_validate(book)

    except Exception as e:
        # 出错时回滚
        db.delete(book)
        db.commit()
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.get("/{book_id}", response_model=BookResponse, summary="获取图书详情")
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取图书详情"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")
    return BookResponse.model_validate(book)


@router.put("/{book_id}", response_model=BookResponse, summary="更新图书信息")
def update_book(
    book_id: int,
    book_update: BookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新图书信息"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    update_data = book_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(book, key, value)

    db.commit()
    db.refresh(book)
    return BookResponse.model_validate(book)


@router.delete("/{book_id}", response_model=MessageResponse, summary="删除图书")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除图书及其文件"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    # 删除文件
    if book.file_path:
        storage.delete_file(book.file_path)
    if book.cover:
        storage.delete_file(book.cover)

    db.delete(book)
    db.commit()
    return MessageResponse(message="删除成功")


@router.get("/{book_id}/cover", summary="获取图书封面")
def get_book_cover(
    book_id: int,
    db: Session = Depends(get_db),
):
    """获取图书封面图片"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book or not book.cover:
        raise HTTPException(status_code=404, detail="封面不存在")

    cover_path = storage.get_file_path(book.cover)
    if not cover_path.exists():
        raise HTTPException(status_code=404, detail="封面文件不存在")

    # 根据扩展名设置 content-type
    ext = cover_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "image/jpeg")

    return FileResponse(path=str(cover_path), media_type=media_type)


@router.get("/{book_id}/download", summary="下载图书")
def download_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载电子书文件"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    file_path = storage.get_file_path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    # 下载文件名
    ext = file_path.suffix
    download_name = f"{book.title}{ext}"

    return FileResponse(
        path=str(file_path),
        filename=download_name,
        media_type="application/octet-stream",
    )
