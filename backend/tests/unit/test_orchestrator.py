from backend.core.orchestrator import DocumentOrchestrator
from backend.modules.text_layer import PageAssignment
from backend.config import Settings
from dataclasses import dataclass


@dataclass
class FakeDocType:
    id: str
    min_pages: int
    max_pages: int


def test_revalidate_lengths_ok():
    settings = Settings()
    assignments = [
        PageAssignment(page_number=0, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=1, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=2, doc_type_id="doc_b", detection_method="text_layer"),
        PageAssignment(page_number=3, doc_type_id="doc_b", detection_method="text_layer"),
        PageAssignment(page_number=4, doc_type_id="doc_b", detection_method="text_layer"),
    ]
    doc_types = {
        "doc_a": FakeDocType(id="doc_a", min_pages=1, max_pages=3),
        "doc_b": FakeDocType(id="doc_b", min_pages=2, max_pages=5),
    }
    orch = DocumentOrchestrator(db=None, settings=settings)
    result = orch._revalidate_lengths(assignments, doc_types)
    for a in result:
        assert a.error_code is None


def test_revalidate_lengths_invalid():
    settings = Settings()
    assignments = [
        PageAssignment(page_number=0, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=1, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=2, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=3, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=4, doc_type_id="doc_a", detection_method="text_layer"),
    ]
    doc_types = {
        "doc_a": FakeDocType(id="doc_a", min_pages=1, max_pages=3),
    }
    orch = DocumentOrchestrator(db=None, settings=settings)
    result = orch._revalidate_lengths(assignments, doc_types)
    for a in result:
        assert a.error_code == "invalid_length"


def test_assign_document_boundaries():
    settings = Settings()
    assignments = [
        PageAssignment(page_number=0, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=1, doc_type_id="doc_a", detection_method="text_layer"),
        PageAssignment(page_number=2, doc_type_id="doc_b", detection_method="text_layer"),
        PageAssignment(page_number=3, doc_type_id="doc_b", detection_method="text_layer"),
    ]
    orch = DocumentOrchestrator(db=None, settings=settings)
    docs = orch._assign_document_boundaries(assignments)
    assert len(docs) == 2
    assert docs[0]["doc_type_id"] == "doc_a"
    assert docs[0]["start_page"] == 0
    assert docs[0]["end_page"] == 1
    assert docs[1]["doc_type_id"] == "doc_b"
    assert docs[1]["start_page"] == 2
    assert docs[1]["end_page"] == 3
