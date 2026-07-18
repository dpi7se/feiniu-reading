"""Pydantic 数据模型 (Schema) - 请求与响应数据验证"""
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


# ==================== 用户相关 Schema ====================

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    nickname: Optional[str] = None
    avatar: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    password: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== 图书相关 Schema ====================

class BookBase(BaseModel):
    title: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    publish_date: Optional[date] = None
    description: Optional[str] = None
    language: Optional[str] = None
    pages: Optional[int] = None


class BookCreate(BookBase):
    format: str
    file_path: str
    size: Optional[int] = None
    cover: Optional[str] = None


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    publish_date: Optional[date] = None
    description: Optional[str] = None
    language: Optional[str] = None
    pages: Optional[int] = None


class BookResponse(BookBase):
    id: int
    format: str
    cover: Optional[str] = None
    size: Optional[int] = None
    file_path: str
    created_at: datetime
    categories: List["CategoryResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ==================== 阅读进度相关 Schema ====================

class ReadingProgressBase(BaseModel):
    current_page: int = 0
    current_chapter: int = 0
    progress: float = Field(0, ge=0, le=100)
    total_read_time: int = 0


class ReadingProgressUpdate(ReadingProgressBase):
    pass


class ReadingProgressResponse(ReadingProgressBase):
    id: int
    user_id: int
    book_id: int
    last_read_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    book: Optional[BookResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== 笔记相关 Schema ====================

class NoteBase(BaseModel):
    content: str
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    highlight: Optional[str] = None


class NoteCreate(NoteBase):
    book_id: int


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    highlight: Optional[str] = None


class NoteResponse(NoteBase):
    id: int
    user_id: int
    book_id: int
    created_at: datetime
    updated_at: datetime
    book: Optional[BookResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== 分类相关 Schema ====================

class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    icon: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    icon: Optional[str] = None


class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime
    children: List["CategoryResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ==================== 通用 Schema ====================

class PaginatedResponse(BaseModel):
    """分页响应"""
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    """消息响应"""
    message: str
    success: bool = True


# 解决前向引用
BookResponse.model_rebuild()
ReadingProgressResponse.model_rebuild()
NoteResponse.model_rebuild()
CategoryResponse.model_rebuild()
