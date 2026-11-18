#!/usr/bin/env python3
"""Bounded local PDF text extraction. stdin bytes -> JSON; no model/network calls."""
import io
import json
import logging
import sys

logging.disable(logging.CRITICAL)
MAX_BYTES = 25 * 1024 * 1024
MAX_PAGES = 800
MAX_PAGE_TEXT = 30000
MAX_TOTAL_TEXT = 5_000_000


def has_images(page):
    """Inspect image resources without decoding image bytes or executing content."""
    visited = set()
    budget = [1000]

    def scan(resources, depth=0):
        if not resources or depth > 8 or budget[0] <= 0:
            return False
        resources = resources.get_object()
        objects = resources.get("/XObject")
        if not objects:
            return False
        for ref in objects.get_object().values():
            budget[0] -= 1
            if budget[0] <= 0:
                break
            obj = ref.get_object()
            identity = id(obj)
            if identity in visited:
                continue
            visited.add(identity)
            if obj.get("/Subtype") == "/Image":
                return True
            if obj.get("/Subtype") == "/Form" and scan(obj.get("/Resources"), depth + 1):
                return True
        return False

    try:
        return scan(page.get("/Resources"))
    except Exception:
        return False


def extract_pages(reader):
    count = len(reader.pages)
    if count < 1 or count > MAX_PAGES:
        raise ValueError("page_limit")
    pages = []
    total = 0
    for number in range(count):
        text = ""
        if total >= MAX_TOTAL_TEXT:
            status = "limit_reached"
        else:
            try:
                text = (reader.pages[number].extract_text() or "").replace("\x00", "").strip()
                text = text.encode("utf-8", errors="replace").decode("utf-8")
                limit = min(MAX_PAGE_TEXT, MAX_TOTAL_TEXT - total)
                encoded = text.encode("utf-16-le")
                status = "no_text" if not text else "truncated" if len(encoded) // 2 > limit else "extracted"
                text = encoded[:limit * 2].decode("utf-16-le", errors="ignore")
            except Exception:
                status = "error"
        total += len(text.encode("utf-16-le")) // 2
        image_present = False
        try:
            image_present = has_images(reader.pages[number])
        except Exception:
            pass
        pages.append({"page": number + 1, "text": text, "status": status, "hasImages": image_present})
    return {"pageCount": count, "pages": pages}


def main():
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (35, 35))
        if sys.platform == "linux":
            resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
        from pypdf import PdfReader
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES or not data.startswith(b"%PDF-"):
            raise ValueError("invalid_pdf")
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValueError("encrypted_pdf")
        result = extract_pages(reader)
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=True))
    except ImportError:
        print(json.dumps({"ok": False, "code": "reader_unavailable"}))
        sys.exit(1)
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error) in {"invalid_pdf", "encrypted_pdf", "page_limit"} else "unreadable_pdf"
        print(json.dumps({"ok": False, "code": code}))
        sys.exit(1)


if __name__ == "__main__":
    main()
