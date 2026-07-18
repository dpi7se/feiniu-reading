"""图书刮削服务 - 从电子书文件中提取元数据"""
import io
import os
import re
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import date

from config import settings


def extract_metadata(file_path: str, fmt: str) -> Dict[str, Any]:
    """
    从电子书文件中提取元数据

    Args:
        file_path: 文件绝对路径
        fmt: 文件格式 (epub, pdf, mobi, azw3, txt)

    Returns:
        包含元数据的字典: {
            title, author, isbn, publisher, publish_date,
            description, language, pages, cover (bytes)
        }
    """
    fmt = fmt.lower()
    metadata = {
        "title": None,
        "author": None,
        "isbn": None,
        "publisher": None,
        "publish_date": None,
        "description": None,
        "language": None,
        "pages": None,
        "cover_data": None,
    }

    try:
        if fmt == "epub":
            metadata.update(_extract_epub(file_path))
        elif fmt == "pdf":
            metadata.update(_extract_pdf(file_path))
        elif fmt in ("mobi", "azw3"):
            metadata.update(_extract_mobi(file_path))
        elif fmt == "txt":
            metadata.update(_extract_txt(file_path))
    except Exception as e:
        # 刮削失败不阻断流程，返回默认值
        print(f"[Scraper] 提取元数据失败 ({fmt}): {e}")

    # 如果没有标题，使用文件名
    if not metadata["title"]:
        metadata["title"] = Path(file_path).stem

    return metadata


def _extract_epub(file_path: str) -> Dict[str, Any]:
    """提取 EPUB 元数据"""
    import ebooklib
    from ebooklib import epub
    from bs4 import BeautifulSoup

    result: Dict[str, Any] = {}
    book = epub.read_epub(file_path, options={"ignore_ncx": True})

    # 基本信息
    result["title"] = book.get_metadata("DC", "title")[0][0] if book.get_metadata("DC", "title") else None
    result["author"] = _format_epub_authors(book.get_metadata("DC", "creator"))
    result["isbn"] = _extract_isbn_from_epub(book)
    result["publisher"] = book.get_metadata("DC", "publisher")[0][0] if book.get_metadata("DC", "publisher") else None
    result["language"] = book.get_metadata("DC", "language")[0][0] if book.get_metadata("DC", "language") else None
    result["description"] = book.get_metadata("DC", "description")[0][0] if book.get_metadata("DC", "description") else None

    # 出版日期
    date_meta = book.get_metadata("DC", "date")
    if date_meta:
        result["publish_date"] = _parse_date(date_meta[0][0])

    # 封面图片
    for item in book.get_items_of_type(ebooklib.ITEM_COVER):
        result["cover_data"] = item.content
        break
    if not result.get("cover_data"):
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE and "cover" in item.get_name().lower():
                result["cover_data"] = item.content
                break

    return result


def _format_epub_authors(creators) -> Optional[str]:
    """格式化 EPUB 作者列表"""
    if not creators:
        return None
    authors = [c[0] for c in creators if c[0]]
    return ", ".join(authors) if authors else None


def _extract_isbn_from_epub(book) -> Optional[str]:
    """从 EPUB 中提取 ISBN"""
    identifiers = book.get_metadata("DC", "identifier")
    for ident in identifiers:
        value = ident[0]
        attrs = ident[1]
        scheme = attrs.get("opf:scheme", "").upper() if attrs else ""
        if scheme == "ISBN" or re.match(r"^[0-9\-Xx]{10,17}$", value):
            return value
    return None


def _extract_pdf(file_path: str) -> Dict[str, Any]:
    """提取 PDF 元数据"""
    from PyPDF2 import PdfReader

    result: Dict[str, Any] = {}
    reader = PdfReader(file_path)

    # 页数
    result["pages"] = len(reader.pages)

    # 元数据
    meta = reader.metadata
    if meta:
        result["title"] = _clean_pdf_str(meta.get("/Title"))
        result["author"] = _clean_pdf_str(meta.get("/Author"))
        result["publisher"] = _clean_pdf_str(meta.get("/Publisher"))
        result["description"] = _clean_pdf_str(meta.get("/Subject"))

        # 出版日期
        date_str = _clean_pdf_str(meta.get("/CreationDate"))
        if date_str:
            result["publish_date"] = _parse_date(date_str)

    # PDF 封面（第一页渲染需要额外依赖，这里跳过）
    return result


def _clean_pdf_str(value) -> Optional[str]:
    """清理 PDF 元数据字符串"""
    if not value:
        return None
    s = str(value).strip()
    if s.startswith("b'") and s.endswith("'"):
        try:
            s = s[2:-1].encode().decode("unicode_escape")
        except Exception:
            pass
    return s or None


def _extract_mobi(file_path: str) -> Dict[str, Any]:
    """提取 MOBI/AZW3 元数据"""
    try:
        from mobimeta import MobiReader, MobiMeta

        result: Dict[str, Any] = {}
        with open(file_path, "rb") as f:
            reader = MobiReader(f)
            reader.readKindleHeader()
            reader.readMobiHeader()
            reader.readEXTH()
            meta = reader.getMobiMeta()

            result["title"] = meta.getTitle()
            result["author"] = ", ".join(meta.getAuthor()) if meta.getAuthor() else None
            result["isbn"] = meta.getISBN() or None
            result["publisher"] = meta.getPublisher()
            result["description"] = meta.getDescription()

            # 封面
            cover_data = meta.getCoverImage()
            if cover_data:
                result["cover_data"] = cover_data

        return result
    except ImportError:
        # mobimeta 库不可用时返回空
        return {}
    except Exception as e:
        print(f"[Scraper] MOBI 提取失败: {e}")
        return {}


def _extract_txt(file_path: str) -> Dict[str, Any]:
    """提取 TXT 元数据（从文件名推断）"""
    return {}  # TXT 无元数据，标题会用文件名


def _parse_date(date_str: str) -> Optional[date]:
    """解析日期字符串"""
    if not date_str:
        return None
    # 常见格式: YYYY-MM-DD, YYYY/MM/DD, YYYY-MM-DDTHH:MM:SS, D:YYYYMMDD
    patterns = [
        r"(\d{4})-(\d{1,2})-(\d{1,2})",
        r"(\d{4})/(\d{1,2})/(\d{1,2})",
        r"D:(\d{4})(\d{2})(\d{2})",
        r"(\d{4})(\d{2})(\d{2})",
    ]
    for pattern in patterns:
        m = re.search(pattern, date_str)
        if m:
            try:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                continue
    return None
