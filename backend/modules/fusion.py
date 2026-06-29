from dataclasses import dataclass

from backend.modules.ocr_module import PatternMatch
from backend.modules.cv_module import VisualPatterns


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
