"""认证与用户路由 - 用户登录、注册、信息管理"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import UserCreate, UserLogin, UserResponse, UserUpdate, Token, MessageResponse
from auth import (
    hash_password, verify_password, create_access_token,
    authenticate_user, get_current_user, get_user_by_username,
)

# 认证路由（登录、注册）
auth_router = APIRouter(prefix="/api/auth", tags=["认证"])

# 用户路由（当前用户信息管理）
users_router = APIRouter(prefix="/api/users", tags=["用户"])


@auth_router.post("/login", response_model=Token, summary="用户登录")
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """用户登录，返回 JWT Token"""
    user = authenticate_user(db, user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@auth_router.post("/register", response_model=UserResponse, summary="用户注册")
def register(user_create: UserCreate, db: Session = Depends(get_db)):
    """用户注册"""
    if get_user_by_username(db, user_create.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )
    user = User(
        username=user_create.username,
        password_hash=hash_password(user_create.password),
        nickname=user_create.nickname or user_create.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@users_router.get("/me", response_model=UserResponse, summary="获取当前用户信息")
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return UserResponse.model_validate(current_user)


@users_router.put("/me", response_model=UserResponse, summary="更新当前用户信息")
def update_me(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新当前用户信息（昵称、头像、密码）"""
    if user_update.nickname is not None:
        current_user.nickname = user_update.nickname
    if user_update.avatar is not None:
        current_user.avatar = user_update.avatar
    if user_update.password is not None:
        current_user.password_hash = hash_password(user_update.password)

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)
