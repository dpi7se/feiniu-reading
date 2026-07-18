"""认证模块 - JWT 认证与密码哈希"""
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 密码流
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# HTTP Basic 认证（用于 OPDS）
basic_auth = HTTPBasic(auto_error=False)


def hash_password(password: str) -> str:
    """哈希密码"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT 访问令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """根据用户名查询用户"""
    return db.query(User).filter(User.username == username).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """验证用户"""
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """获取当前登录用户（JWT 认证依赖）"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(db, username)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )
    return user


async def get_current_user_basic(
    credentials: Optional[HTTPBasicCredentials] = Depends(basic_auth),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """HTTP Basic 认证（用于 OPDS 接口）"""
    if credentials is None:
        return None
    user = authenticate_user(db, credentials.username, credentials.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的凭据",
            headers={"WWW-Authenticate": "Basic"},
        )
    return user


def init_default_admin(db: Session):
    """初始化默认管理员账户"""
    admin = get_user_by_username(db, "admin")
    if admin is None:
        admin = User(
            username="admin",
            password_hash=hash_password("admin123"),
            nickname="管理员",
        )
        db.add(admin)
        db.commit()
