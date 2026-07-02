import logging
import os
from dataclasses import dataclass
import numpy as np
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

os.environ.setdefault("FLAGS_use_mkldnn", "0")

try:
    import paddle
    _GPU_AVAILABLE = paddle.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0
except Exception:
    _GPU_AVAILABLE = False


@dataclass
class PatternMatch:
    doc_type_id: str
    pattern: str
    score: float
    start_pos: int = 0


class OCRModule:
    def __init__(self):
        try:
            from paddleocr import PaddleOCR

            logger.info("Initializing PaddleOCR — lang=ru, GPU=%s", _GPU_AVAILABLE)

            self.ocr = PaddleOCR(
                use_textline_orientation=True,
                lang="ru",
                text_det_thresh=0.4,
                text_det_box_thresh=0.6,
                text_det_limit_side_len=1280,
                text_recognition_batch_size=1,
            )

            logger.info("PaddleOCR initialized")
        except Exception as e:
            logger.warning("PaddleOCR not available: %s", e)
            self.ocr = None

    def extract_text(self, image: np.ndarray) -> str:
        if self.ocr is None:
            return ""
        try:
            result = self.ocr.ocr(image)
        except Exception as e:
            logger.error("OCR inference failed: %s", e)
            return ""
        texts = []
        if result:
            for page in result:
                if page is None:
                    continue
                if hasattr(page, 'rec_texts') and page.rec_texts:
                    texts.extend(page.rec_texts)
                elif isinstance(page, dict):
                    for item in page.get('rec_texts', []):
                        if item:
                            texts.append(str(item))
                elif isinstance(page, (list, tuple)):
                    for line in page:
                        if isinstance(line, (list, tuple)) and len(line) > 1:
                            text_data = line[1]
                            if isinstance(text_data, (list, tuple)):
                                texts.append(str(text_data[0]))
                            else:
                                texts.append(str(text_data))
        combined = " ".join(texts)
        logger.debug("OCR extracted %d chars", len(combined))
        return combined

    def match_patterns(
        self,
        ocr_text: str,
        document_types: list,
        threshold: float = 0.87,
    ) -> list[PatternMatch]:
        if not ocr_text:
            return []
        matches = []
        text_lower = ocr_text.lower()
        for dt in document_types:
            for pattern in dt.text_patterns:
                if not isinstance(pattern, str):
                    continue
                score = fuzz.partial_ratio(pattern.lower(), text_lower) / 100.0
                if score >= threshold:
                    matches.append(PatternMatch(
                        doc_type_id=dt.id,
                        pattern=pattern,
                        score=score,
                    ))
        matches.sort(key=lambda m: m.score, reverse=True)
        if matches:
            logger.debug("OCR matched %d patterns, best=%s score=%.2f",
                         len(matches), matches[0].doc_type_id, matches[0].score)
        return matches
