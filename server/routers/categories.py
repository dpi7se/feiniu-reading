"""分类路由"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Category, Book
from schemas import CategoryResponse, CategoryCreate, CategoryUpdate
from auth import get_current_user

router = APIRouter(prefix="/api/categories", tags=["分类"])


def build_category_tree(categories: List[Category]) -> List[dict]:
    """构建分类树形结构"""
    # 先建立 id -> category 映射
    cat_map = {}
    for cat in categories:
        cat_map[cat.id] = {
            "id": cat.id,
            "name": cat.name,
            "parent_id": cat.parent_id,
            "icon": cat.icon,
            "created_at": cat.created_at.isoformat() if cat.created_at else None,
            "children": [],
            "book_count": len(cat.books),
        }

    # 构建树
    roots = []
    for cat_id, cat_dict in cat_map.items():
        parent_id = cat_dict["parent_id"]
        if parent_id is None or parent_id not in cat_map:
            roots.append(cat_dict)
        else:
            cat_map[parent_id]["children"].append(cat_dict)

    return roots


@router.get("", summary="获取分类列表（树形结构）")
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取分类树形结构"""
    categories = db.query(Category).order_by(Category.name).all()
    return build_category_tree(categories)


@router.post("", response_model=dict, summary="创建分类")
def create_category(
    category_create: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建分类"""
    # 检查父分类是否存在
    if category_create.parent_id:
        parent = db.query(Category).filter(Category.id == category_create.parent_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="父分类不存在")

    category = Category(
        name=category_create.name,
        parent_id=category_create.parent_id,
        icon=category_create.icon,
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return {
        "id": category.id,
        "name": category.name,
        "parent_id": category.parent_id,
        "icon": category.icon,
        "created_at": category.created_at.isoformat() if category.created_at else None,
        "children": [],
        "book_count": 0,
    }


@router.put("/{category_id}", response_model=dict, summary="更新分类")
def update_category(
    category_id: int,
    category_update: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新分类"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 防止循环引用
    if category_update.parent_id == category_id:
        raise HTTPException(status_code=400, detail="不能将自身设为父分类")
    if category_update.parent_id:
        # 检查父分类是否是自己的子孙
        if _is_descendant(db, category_id, category_update.parent_id):
            raise HTTPException(status_code=400, detail="不能将子分类设为父分类（循环引用）")

    update_data = category_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)

    return {
        "id": category.id,
        "name": category.name,
        "parent_id": category.parent_id,
        "icon": category.icon,
        "created_at": category.created_at.isoformat() if category.created_at else None,
        "book_count": len(category.books),
    }


def _is_descendant(db: Session, ancestor_id: int, candidate_id: int) -> bool:
    """检查 candidate_id 是否是 ancestor_id 的子孙"""
    stack = [ancestor_id]
    visited = set()
    while stack:
        current_id = stack.pop()
        if current_id in visited:
            continue
        visited.add(current_id)
        children = db.query(Category).filter(Category.parent_id == current_id).all()
        for child in children:
            if child.id == candidate_id:
                return True
            stack.append(child.id)
    return False


@router.delete("/{category_id}", summary="删除分类")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除分类（子分类会级联删除）"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    db.delete(category)
    db.commit()
    return {"message": "删除成功", "success": True}
