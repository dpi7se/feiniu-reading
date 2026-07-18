"""阅读进度路由"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Book, ReadingProgress
from schemas import ReadingProgressResponse, ReadingProgressUpdate
from auth import get_current_user

router = APIRouter(prefix="/api/progress", tags=["阅读进度"])


@router.get("", summary="获取当前用户阅读进度列表")
def list_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户所有阅读进度，按最后阅读时间倒序"""
    progress_list = (
        db.query(ReadingProgress)
        .filter(ReadingProgress.user_id == current_user.id)
        .order_by(ReadingProgress.last_read_at.desc().nullslast())
        .all()
    )
    return [ReadingProgressResponse.model_validate(p).model_dump() for p in progress_list]


@router.get("/{book_id}", response_model=ReadingProgressResponse, summary="获取指定图书阅读进度")
def get_progress(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户在指定图书的阅读进度"""
    progress = (
        db.query(ReadingProgress)
        .filter(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.book_id == book_id,
        )
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="未找到阅读进度")
    return ReadingProgressResponse.model_validate(progress)


@router.put("/{book_id}", response_model=ReadingProgressResponse, summary="更新阅读进度")
def update_progress(
    book_id: int,
    progress_update: ReadingProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新或创建阅读进度"""
    # 检查图书是否存在
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    # 查找现有进度
    progress = (
        db.query(ReadingProgress)
        .filter(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.book_id == book_id,
        )
        .first()
    )

    if progress:
        # 更新
        progress.current_page = progress_update.current_page
        progress.current_chapter = progress_update.current_chapter
        progress.progress = progress_update.progress
        progress.total_read_time = progress_update.total_read_time
        progress.last_read_at = datetime.utcnow()
    else:
        # 创建
        progress = ReadingProgress(
            user_id=current_user.id,
            book_id=book_id,
            current_page=progress_update.current_page,
            current_chapter=progress_update.current_chapter,
            progress=progress_update.progress,
            total_read_time=progress_update.total_read_time,
            last_read_at=datetime.utcnow(),
        )
        db.add(progress)

    db.commit()
    db.refresh(progress)
    return ReadingProgressResponse.model_validate(progress)


@router.delete("/{book_id}", summary="删除阅读进度")
def delete_progress(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除当前用户在指定图书的阅读进度"""
    progress = (
        db.query(ReadingProgress)
        .filter(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.book_id == book_id,
        )
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="未找到阅读进度")

    db.delete(progress)
    db.commit()
    return {"message": "删除成功", "success": True}
