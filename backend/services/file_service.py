import uuid
from pathlib import Path

import cv2
import numpy as np
from backend.config import Settings


def save_content_to_file(job_id: uuid.UUID, content: bytes) -> Path:
    settings = Settings()
    input_dir = Path(settings.INPUT_DIR)
    job_dir = input_dir / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    dest = job_dir / "original.pdf"
    dest.write_bytes(content)
    return dest


def get_page_preview_path(job_id: str, page_num: int) -> Path:
    settings = Settings()
    return Path(settings.TEMP_DIR) / str(job_id) / "previews" / f"page_{page_num:04d}.jpg"


def render_and_cache_preview(pdf_path: str, job_id: str, page_num: int, dpi: int = 100) -> Path | None:
    preview_path = get_page_preview_path(job_id, page_num)
    if preview_path.exists():
        return preview_path
    if not Path(pdf_path).exists():
        return None
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    import fitz
    doc = fitz.open(pdf_path)
    if page_num < 0 or page_num >= len(doc):
        doc.close()
        return None
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    doc.close()
    img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(preview_path), img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return preview_path
