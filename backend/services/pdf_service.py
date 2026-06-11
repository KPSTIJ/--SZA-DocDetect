from pathlib import Path
import numpy as np
import fitz


def extract_text_layer(pdf_path: str) -> list[dict]:
    doc = fitz.open(pdf_path)
    result = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        has_text_layer = len(text.strip()) >= 50
        result.append({
            "page": page_num,
            "text": text,
            "has_text_layer": has_text_layer,
        })
    doc.close()
    return result


def render_page_to_image(pdf_path: str, page_num: int, dpi: int = 200) -> np.ndarray | None:
    doc = fitz.open(pdf_path)
    if page_num < 0 or page_num >= len(doc):
        doc.close()
        return None
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    doc.close()
    return img


def enhance_for_ocr(image: np.ndarray) -> np.ndarray:
    import cv2
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    denoised = cv2.fastNlMeansDenoising(binary, h=30)
    return cv2.cvtColor(denoised, cv2.COLOR_GRAY2RGB)


def enhance_for_cv(image: np.ndarray) -> np.ndarray:
    import cv2
    lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge([l, a, b])
    result = cv2.cvtColor(enhanced, cv2.COLOR_LAB2RGB)
    return result


def split_pdf(source_path: str, output_path: str, start_page: int, end_page: int) -> str:
    doc = fitz.open(source_path)
    out_doc = fitz.open()
    out_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    out_doc.save(output_path)
    out_doc.close()
    doc.close()
    return output_path


def build_output_filename(source_name: str, doc_type: str, occurrence: int = 1) -> str:
    stem = Path(source_name).stem
    if occurrence > 1:
        return f"{stem}_{doc_type}_{occurrence}.pdf"
    return f"{stem}_{doc_type}.pdf"
