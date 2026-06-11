from dataclasses import dataclass
from backend.modules.text_layer import (
    find_title_pages_by_text,
    assign_pages_from_title_pages,
    TitlePageMatch,
    PageAssignment,
)


@dataclass
class FakeDocumentType:
    id: str
    name: str = ""
    text_patterns: list = None
    min_pages: int = 1
    max_pages: int = 5
    visual_hints: dict = None

    def __post_init__(self):
        if self.text_patterns is None:
            self.text_patterns = []
        if self.visual_hints is None:
            self.visual_hints = {}


def test_first_page_not_title():
    pages = [
        {"page": 0, "text": "какой-то текст", "has_text_layer": True},
        {"page": 1, "text": "КРЕДИТНЫЙ ДОГОВОР №123", "has_text_layer": True},
        {"page": 2, "text": "текст договора", "has_text_layer": True},
    ]
    doc_types = [FakeDocumentType(id="credit", text_patterns=["кредитный договор"], min_pages=1, max_pages=5)]
    title_matches = find_title_pages_by_text(pages, doc_types)
    result = assign_pages_from_title_pages(title_matches, 3, {"credit": doc_types[0]})
    assert result[0].doc_type_id is None
    assert result[0].error_code == "undetected"
    assert result[1].doc_type_id == "credit"
    assert result[1].is_title_page is True
    assert result[2].doc_type_id == "credit"


def test_invalid_length_marked():
    pages = [
        {"page": 0, "text": "ДОГОВОР №1", "has_text_layer": True},
        {"page": 1, "text": "текст стр 1", "has_text_layer": True},
        {"page": 2, "text": "текст стр 2", "has_text_layer": True},
        {"page": 3, "text": "текст стр 3", "has_text_layer": True},
        {"page": 4, "text": "текст стр 4", "has_text_layer": True},
    ]
    doc_types = [FakeDocumentType(id="contract", text_patterns=["договор"], min_pages=1, max_pages=3)]
    title_matches = find_title_pages_by_text(pages, doc_types)
    result = assign_pages_from_title_pages(title_matches, 5, {"contract": doc_types[0]})
    assert result[0].doc_type_id == "contract"
    assert result[0].is_title_page is True
    assert result[0].error_code == "invalid_length"
    for a in result:
        assert a.error_code == "invalid_length"


def test_multiple_same_type():
    pages = [
        {"page": 0, "text": "ДОГОВОР №1", "has_text_layer": True},
        {"page": 1, "text": "текст", "has_text_layer": True},
        {"page": 2, "text": "ДОГОВОР №2", "has_text_layer": True},
        {"page": 3, "text": "ещё текст", "has_text_layer": True},
    ]
    doc_types = [FakeDocumentType(id="contract", text_patterns=["договор"], min_pages=1, max_pages=5)]
    title_matches = find_title_pages_by_text(pages, doc_types)
    result = assign_pages_from_title_pages(title_matches, 4, {"contract": doc_types[0]})
    assert len(result) == 4
    assert result[0].doc_type_id == "contract"
    assert result[2].doc_type_id == "contract"
    assert result[2].is_title_page is True


def test_unknown_pages_between_docs():
    pages = [
        {"page": 0, "text": "АКТ №1", "has_text_layer": True},
        {"page": 1, "text": "текст акта", "has_text_layer": True},
        {"page": 2, "text": "мусор", "has_text_layer": True},
        {"page": 3, "text": "ДОГОВОР №1", "has_text_layer": True},
    ]
    doc_types = [
        FakeDocumentType(id="act", text_patterns=["акт"], min_pages=1, max_pages=3),
        FakeDocumentType(id="contract", text_patterns=["договор"], min_pages=1, max_pages=3),
    ]
    title_matches = find_title_pages_by_text(pages, doc_types)
    doc_dict = {"act": doc_types[0], "contract": doc_types[1]}
    result = assign_pages_from_title_pages(title_matches, 4, doc_dict)
    assert result[0].doc_type_id == "act"
    assert result[1].doc_type_id == "act"
    assert result[3].doc_type_id == "contract"
