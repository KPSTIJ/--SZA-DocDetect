from backend.modules.fusion import combine_ocr_and_cv
from backend.modules.ocr_module import PatternMatch
from backend.modules.cv_module import VisualPatterns


def test_ocr_match_with_cv_confirmation():
    ocr_match = PatternMatch(doc_type_id="passport", pattern="паспорт", score=0.90)
    visual = VisualPatterns(has_photo_top_right=True, is_likely_title_page=True)
    result = combine_ocr_and_cv(ocr_match, visual, [], 0.87)
    assert result.doc_type_id == "passport"
    assert result.confidence >= 0.90
    assert result.confidence <= 1.0


def test_no_ocr_no_cv():
    result = combine_ocr_and_cv(None, VisualPatterns(), [], 0.87)
    assert result.doc_type_id is None
    assert result.confidence == 0.0


def test_ocr_below_threshold():
    ocr_match = PatternMatch(doc_type_id="passport", pattern="паспорт", score=0.70)
    result = combine_ocr_and_cv(ocr_match, VisualPatterns(), [], 0.87)
    assert result.doc_type_id is None


def test_ocr_above_threshold_neutral_cv():
    ocr_match = PatternMatch(doc_type_id="credit", pattern="кредит", score=0.90)
    visual = VisualPatterns()
    result = combine_ocr_and_cv(ocr_match, visual, [], 0.87)
    assert result.doc_type_id == "credit"
    assert abs(result.confidence - 0.90) < 0.01


def test_cv_title_page_only():
    visual = VisualPatterns(is_likely_title_page=True, has_title_block=True)
    result = combine_ocr_and_cv(None, visual, [], 0.87)
    assert result.doc_type_id is None
    assert abs(result.confidence - 0.60) < 0.01
