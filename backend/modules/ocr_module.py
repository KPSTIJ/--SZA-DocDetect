import logging
from dataclasses import dataclass
import numpy as np
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)


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
            logger.info("Initializing PaddleOCR with lang=ru")
            self.ocr = PaddleOCR(use_angle_cls=True, lang='ru')
            logger.info("PaddleOCR initialized successfully")
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
                if page:
                    for line in page:
                        if isinstance(line, (list, tuple)) and len(line) > 1:
                            text_data = line[1]
                            if isinstance(text_data, (list, tuple)):
                                text = text_data[0]
                            else:
                                text = str(text_data)
                            texts.append(text)
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
