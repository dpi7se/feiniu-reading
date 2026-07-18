"""SQLAlchemy 数据模型 - 飞牛图书系统"""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Text, Float, Date, DateTime, ForeignKey,
    UniqueConstraint, Table, Boolean
)
from sqlalchemy.orm import relationship

from database import Base


# 图书-分类多对多关联表
book_categories = Table(
    "book_categories",
    Base.metadata,
    Column("book_id", Integer, ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(50))
    avatar = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    reading_progress = relationship("ReadingProgress", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")


class Book(Base):
    """图书表"""
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    author = Column(String(255), index=True)
    isbn = Column(String(20), index=True)
    publisher = Column(String(100))
    publish_date = Column(Date)
    cover = Column(String(255))
    format = Column(String(20), nullable=False)
    file_path = Column(String(500), nullable=False)
    size = Column(Integer)
    description = Column(Text)
    language = Column(String(10))
    pages = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    categories = relationship("Category", secondary=book_categories, back_populates="books")
    reading_progress = relationship("ReadingProgress", back_populates="book", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="book", cascade="all, delete-orphan")


class ReadingProgress(Base):
    """阅读进度表"""
    __tablename__ = "reading_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    current_page = Column(Integer, default=0)
    current_chapter = Column(Integer, default=0)
    progress = Column(Float, default=0)
    last_read_at = Column(DateTime)
    total_read_time = Column(Integer, default=0)  # 秒
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 唯一约束：一个用户对一本书只有一条进度记录
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_user_book_progress"),)

    # 关系
    user = relationship("User", back_populates="reading_progress")
    book = relationship("Book", back_populates="reading_progress")


class Note(Base):
    """笔记表"""
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer)
    chapter = Column(String(100))
    highlight = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="notes")
    book = relationship("Book", back_populates="notes")


class Category(Base):
    """分类表"""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)
    icon = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    books = relationship("Book", secondary=book_categories, back_populates="categories")
    children = relationship("Category", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("Category", back_populates="children", remote_side=[id])
