"""笔记路由"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import User, Book, Note
from schemas import NoteResponse, NoteCreate, NoteUpdate
from auth import get_current_user

router = APIRouter(prefix="/api/notes", tags=["笔记"])


@router.get("", summary="获取笔记列表")
def list_notes(
    book_id: Optional[int] = Query(None, description="按图书筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的笔记列表，可按图书筛选"""
    query = db.query(Note).filter(Note.user_id == current_user.id)
    if book_id:
        query = query.filter(Note.book_id == book_id)

    notes = query.order_by(Note.created_at.desc()).all()
    return [NoteResponse.model_validate(n).model_dump() for n in notes]


@router.post("", response_model=NoteResponse, summary="创建笔记")
def create_note(
    note_create: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建笔记"""
    # 检查图书是否存在
    book = db.query(Book).filter(Book.id == note_create.book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    note = Note(
        user_id=current_user.id,
        book_id=note_create.book_id,
        content=note_create.content,
        page_number=note_create.page_number,
        chapter=note_create.chapter,
        highlight=note_create.highlight,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return NoteResponse.model_validate(note)


@router.put("/{note_id}", response_model=NoteResponse, summary="更新笔记")
def update_note(
    note_id: int,
    note_update: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新笔记"""
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    update_data = note_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    db.commit()
    db.refresh(note)
    return NoteResponse.model_validate(note)


@router.delete("/{note_id}", summary="删除笔记")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除笔记"""
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    db.delete(note)
    db.commit()
    return {"message": "删除成功", "success": True}
