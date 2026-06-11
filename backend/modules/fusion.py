from dataclasses import dataclass
import asyncio
import numpy as np

from backend.modules.ocr_module import OCRModule, PatternMatch
from backend.modules.cv_module import CVModule, VisualPatterns
from backend.modules.text_layer import PageAssignment
from backend.config import Settings


@dataclass
class FusionResult:
    doc_type_id: str | None = None
    confidence: float = 0.0
    method: str = "fusion"
    error_code: str | None = None
    ocr_match: PatternMatch | None = None
    visual_patterns: VisualPatterns | None = None


def combine_ocr_and_cv(
    ocr_best_match: PatternMatch | None,
    visual: VisualPatterns,
    document_types: list,
    ocr_threshold: float,
) -> FusionResult:
    if ocr_best_match and ocr_best_match.score >= ocr_threshold:
        base_conf = ocr_best_match.score
        if visual.is_likely_title_page:
            conf = min(base_conf * 1.1, 1.0)
        elif visual.is_likely_last_page:
            conf = base_conf * 0.8
        else:
            conf = base_conf
        return FusionResult(
            doc_type_id=ocr_best_match.doc_type_id,
            confidence=conf,
            ocr_match=ocr_best_match,
            visual_patterns=visual,
        )
    elif visual.is_likely_title_page:
        return FusionResult(doc_type_id=None, confidence=0.60, visual_patterns=visual)
    elif visual.is_likely_last_page:
        return FusionResult(
            doc_type_id=None, confidence=0.50,
            error_code="end_of_doc_hint", visual_patterns=visual,
        )
    else:
        return FusionResult(doc_type_id=None, confidence=0.0, visual_patterns=visual)


async def fusion_analyze_page(
    image: np.ndarray,
    document_types: list,
    ocr_module: OCRModule,
    cv_module: CVModule,
    config: Settings,
) -> PageAssignment:
    import cv2
    ocr_img = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    ocr_img = cv2.cvtColor(ocr_img, cv2.COLOR_GRAY2RGB)

    def run_ocr():
        text = ocr_module.extract_text(ocr_img)
        matches = ocr_module.match_patterns(text, document_types, config.OCR_MATCH_THRESHOLD)
        return max(matches, key=lambda m: m.score) if matches else None

    def run_cv():
        return cv_module.detect_visual_patterns(image)

    best_ocr, visual = await asyncio.gather(
        asyncio.to_thread(run_ocr),
        asyncio.to_thread(run_cv),
    )

    result = combine_ocr_and_cv(best_ocr, visual, document_types, config.OCR_MATCH_THRESHOLD)

    return PageAssignment(
        page_number=0,
        doc_type_id=result.doc_type_id,
        is_title_page=(best_ocr is not None and best_ocr.score >= config.OCR_MATCH_THRESHOLD),
        error_code=result.error_code if not result.doc_type_id else None,
        detection_method="fusion",
        confidence=result.confidence,
    )
