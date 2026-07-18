"""OPDS 协议路由 - 开放出版物分发系统

遵循 OPDS 1.2 规范，使用 Atom XML 格式。
允许阅读器软件（如 Marvin, KyBook, Aldiko, Moon+Reader 等）发现和下载图书。
"""
import math
from datetime import datetime
from typing import Optional
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models import Book, Category, User
from auth import get_current_user_basic
from config import settings

router = APIRouter(prefix="/opds/v1.2", tags=["OPDS"])

# XML 命名空间
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
    "opds": "http://opds-spec.org/2010/catalog",
    "thr": "http://purl.org/syndication/thread/1.0",
}

# 注册命名空间前缀
ET.register_namespace("atom", NS["atom"])
ET.register_namespace("dc", NS["dc"])
ET.register_namespace("opds", NS["opds"])
ET.register_namespace("thr", NS["thr"])


def _q(tag: str) -> str:
    """获取带命名空间的标签"""
    return f"{{{NS['atom']}}}{tag}"


def _qdc(tag: str) -> str:
    """获取 DC 命名空间标签"""
    return f"{{{NS['dc']}}}{tag}"


def _qopds(tag: str) -> str:
    """获取 OPDS 命名空间标签"""
    return f"{{{NS['opds']}}}{tag}"


def create_feed(title: str, request: Request) -> ET.Element:
    """创建 OPDS Feed 根元素"""
    feed = ET.Element(_q("feed"))

    # 基本信息元素
    ET.SubElement(feed, _q("id")).text = f"urn:uuid:flying-cow-books:{request.url.path}"
    ET.SubElement(feed, _q("title")).text = title
    ET.SubElement(feed, _q("updated")).text = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    # 作者信息
    author = ET.SubElement(feed, _q("author"))
    ET.SubElement(author, _q("name")).text = settings.OPDS_AUTHOR
    ET.SubElement(author, _q("uri")).text = str(request.base_url)

    # 链接：自身
    self_link = ET.SubElement(feed, _q("link"))
    self_link.set("href", str(request.url))
    self_link.set("rel", "self")
    self_link.set("type", "application/atom+xml;profile=opds-catalog;kind=navigation")

    # 链接：开始
    start_link = ET.SubElement(feed, _q("link"))
    start_link.set("href", str(request.base_url) + "opds/v1.2/catalog")
    start_link.set("rel", "start")
    start_link.set("type", "application/atom+xml;profile=opds-catalog;kind=navigation")

    return feed


def add_entry(feed: ET.Element, entry_id: str, title: str, request: Request,
              content: str = None, link_href: str = None, link_type: str = None,
              link_rel: str = None, book: Book = None):
    """添加条目到 Feed"""
    entry = ET.SubElement(feed, _q("entry"))
    ET.SubElement(entry, _q("id")).text = entry_id
    ET.SubElement(entry, _q("title")).text = title
    ET.SubElement(entry, _q("updated")).text = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    if content:
        content_el = ET.SubElement(entry, _q("content"))
        content_el.set("type", "text")
        content_el.text = content

    if link_href:
        link = ET.SubElement(entry, _q("link"))
        link.set("href", str(request.base_url).rstrip("/") + link_href)
        if link_type:
            link.set("type", link_type)
        if link_rel:
            link.set("rel", link_rel)

    # 如果是图书条目，添加 DC 元数据和获取链接
    if book:
        if book.author:
            ET.SubElement(entry, _qdc("author")).text = book.author
        if book.isbn:
            ET.SubElement(entry, _qdc("identifier")).text = f"urn:isbn:{book.isbn}"
        if book.publisher:
            ET.SubElement(entry, _qdc("publisher")).text = book.publisher
        if book.language:
            ET.SubElement(entry, _qdc("language")).text = book.language
        if book.publish_date:
            ET.SubElement(entry, _qdc("date")).text = book.publish_date.isoformat()

        # 封面缩略图
        if book.cover:
            thumb_link = ET.SubElement(entry, _q("link"))
            thumb_link.set("rel", "http://opds-spec.org/image/thumbnail")
            thumb_link.set("href", str(request.base_url).rstrip("/") + f"/api/books/{book.id}/cover")
            thumb_link.set("type", "image/jpeg")

            image_link = ET.SubElement(entry, _q("link"))
            image_link.set("rel", "http://opds-spec.org/image")
            image_link.set("href", str(request.base_url).rstrip("/") + f"/api/books/{book.id}/cover")
            image_link.set("type", "image/jpeg")

        # 下载链接
        mime_types = {
            "epub": "application/epub+zip",
            "pdf": "application/pdf",
            "mobi": "application/x-mobipocket-ebook",
            "azw3": "application/x-mobipocket-ebook",
            "txt": "text/plain",
        }
        acq_link = ET.SubElement(entry, _q("link"))
        acq_link.set("rel", "http://opds-spec.org/acquisition")
        acq_link.set("href", str(request.base_url).rstrip("/") + f"/api/books/{book.id}/download")
        acq_link.set("type", mime_types.get(book.format, "application/octet-stream"))


def feed_to_xml(feed: ET.Element) -> str:
    """将 Feed 元素转为 XML 字符串"""
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_str += ET.tostring(feed, encoding="unicode")
    return xml_str


@router.get("/catalog", summary="OPDS 目录根")
def catalog(
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_basic),
):
    """OPDS 目录根，展示导航入口"""
    feed = create_feed(settings.OPDS_TITLE, request)

    # 全部图书
    add_entry(
        feed,
        "urn:uuid:flying-cow-books:all-books",
        "全部图书",
        request,
        content=f"共 {db.query(Book).count()} 本图书",
        link_href="/opds/v1.2/books",
        link_type="application/atom+xml;profile=opds-catalog;kind=acquisition",
    )

    # 分类浏览
    categories_count = db.query(Category).filter(Category.parent_id.is_(None)).count()
    add_entry(
        feed,
        "urn:uuid:flying-cow-books:categories",
        "分类浏览",
        request,
        content=f"共 {categories_count} 个分类",
        link_href="/opds/v1.2/categories",
        link_type="application/atom+xml;profile=opds-catalog;kind=navigation",
    )

    # 搜索
    add_entry(
        feed,
        "urn:uuid:flying-cow-books:search",
        "搜索图书",
        request,
        content="按书名、作者搜索",
        link_href="/opds/v1.2/search",
        link_type="application/atom+xml;profile=opds-catalog;kind=navigation",
    )

    return Response(content=feed_to_xml(feed), media_type="application/atom+xml; charset=utf-8")


@router.get("/books", summary="OPDS 图书列表")
def opds_books(
    request: Request,
    page: int = Query(1, ge=1),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_basic),
):
    """OPDS 图书获取列表"""
    query = db.query(Book)
    if category_id:
        from models import book_categories
        query = query.join(book_categories).filter(book_categories.c.category_id == category_id)

    total = query.count()
    page_size = settings.OPDS_PAGE_SIZE
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    books = query.order_by(Book.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    feed = create_feed(f"全部图书 - 第 {page} 页", request)

    for book in books:
        content_parts = []
        if book.author:
            content_parts.append(f"作者: {book.author}")
        if book.format:
            content_parts.append(f"格式: {book.format.upper()}")
        if book.pages:
            content_parts.append(f"页数: {book.pages}")
        content = " | ".join(content_parts) if content_parts else "无详细信息"

        add_entry(
            feed,
            f"urn:uuid:flying-cow-books:book:{book.id}",
            book.title,
            request,
            content=content,
            book=book,
        )

    # 分页链接
    if page > 1:
        prev_link = ET.SubElement(feed, _q("link"))
        prev_link.set("href", str(request.base_url).rstrip("/") + f"/opds/v1.2/books?page={page - 1}")
        prev_link.set("rel", "prev")
        prev_link.set("type", "application/atom+xml;profile=opds-catalog;kind=acquisition")
    if page < total_pages:
        next_link = ET.SubElement(feed, _q("link"))
        next_link.set("href", str(request.base_url).rstrip("/") + f"/opds/v1.2/books?page={page + 1}")
        next_link.set("rel", "next")
        next_link.set("type", "application/atom+xml;profile=opds-catalog;kind=acquisition")

    return Response(content=feed_to_xml(feed), media_type="application/atom+xml; charset=utf-8")


@router.get("/categories", summary="OPDS 分类列表")
def opds_categories(
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_basic),
):
    """OPDS 分类导航"""
    feed = create_feed("分类浏览", request)

    # 获取顶层分类
    categories = db.query(Category).filter(Category.parent_id.is_(None)).order_by(Category.name).all()

    # 全部图书
    add_entry(
        feed,
        "urn:uuid:flying-cow-books:all-books",
        "全部图书",
        request,
        content=f"共 {db.query(Book).count()} 本图书",
        link_href="/opds/v1.2/books",
        link_type="application/atom+xml;profile=opds-catalog;kind=acquisition",
    )

    for cat in categories:
        book_count = len(cat.books)
        add_entry(
            feed,
            f"urn:uuid:flying-cow-books:category:{cat.id}",
            cat.name,
            request,
            content=f"共 {book_count} 本图书",
            link_href=f"/opds/v1.2/books?category_id={cat.id}",
            link_type="application/atom+xml;profile=opds-catalog;kind=acquisition",
        )

    return Response(content=feed_to_xml(feed), media_type="application/atom+xml; charset=utf-8")


@router.get("/search", summary="OPDS 搜索")
def opds_search(
    request: Request,
    q: str = Query(..., description="搜索关键词"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_basic),
):
    """OPDS 搜索接口"""
    from sqlalchemy import or_

    search_term = f"%{q}%"
    query = db.query(Book).filter(
        or_(
            Book.title.ilike(search_term),
            Book.author.ilike(search_term),
            Book.isbn.ilike(search_term),
        )
    )
    books = query.order_by(Book.created_at.desc()).limit(settings.OPDS_PAGE_SIZE).all()

    feed = create_feed(f"搜索: {q}", request)

    for book in books:
        content_parts = []
        if book.author:
            content_parts.append(f"作者: {book.author}")
        if book.format:
            content_parts.append(f"格式: {book.format.upper()}")
        content = " | ".join(content_parts) if content_parts else "无详细信息"

        add_entry(
            feed,
            f"urn:uuid:flying-cow-books:book:{book.id}",
            book.title,
            request,
            content=content,
            book=book,
        )

    return Response(content=feed_to_xml(feed), media_type="application/atom+xml; charset=utf-8")


@router.get("/opensearch.xml", summary="OpenSearch 描述文件")
def opensearch(request: Request):
    """OpenSearch 描述文件，供阅读器发现搜索接口"""
    base_url = str(request.base_url).rstrip("/")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
    <ShortName>飞牛图书</ShortName>
    <Description>飞牛图书家庭书库搜索</Description>
    <InputEncoding>UTF-8</InputEncoding>
    <OutputEncoding>UTF-8</OutputEncoding>
    <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
         template="{base_url}/opds/v1.2/search?q={{searchTerms}}"/>
</OpenSearchDescription>"""
    return Response(content=xml, media_type="application/opensearchdescription+xml; charset=utf-8")
