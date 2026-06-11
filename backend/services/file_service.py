import uuid
from pathlib import Path

import cv2
import numpy as np
from fastapi import UploadFile

from backend.config import Settings


async def save_uploaded_file(job_id: uuid.UUID, file: UploadFile) -> Path:
    settings = Settings()
    input_dir = Path(settings.INPUT_DIR)
    job_dir = input_dir / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    dest = job_dir / "original.pdf"
    content = await file.read()
    dest.write_bytes(content)
    return dest


def get_job_dir(job_id: uuid.UUID) -> Path:
    settings = Settings()
    return Path(settings.INPUT_DIR) / str(job_id)


def get_output_path(job_id: uuid.UUID, doc_type_id: str, occurrence: int = 1) -> Path:
    settings = Settings()
    output_dir = Path(settings.OUTPUT_DIR) / str(job_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / f"{doc_type_id}_{occurrence}.pdf"


def get_page_preview_path(job_id: str, page_num: int) -> Path:
    settings = Settings()
    return Path(settings.TEMP_DIR) / str(job_id) / "previews" / f"page_{page_num:04d}.jpg"


def render_and_cache_preview(pdf_path: str, job_id: str, page_num: int, dpi: int = 100) -> Path | None:
    preview_path = get_page_preview_path(job_id, page_num)
    if preview_path.exists():
        return preview_path
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
