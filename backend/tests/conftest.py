import pytest
from unittest.mock import MagicMock, AsyncMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.config import Settings


# Duplicate minimal dataclass to avoid importing modules with unavailable ML packages
from dataclasses import dataclass


@dataclass
class PageAssignment:
    page_number: int
    doc_type_id: str | None = None
    is_title_page: bool = False
    error_code: str | None = None
    detection_method: str = "text_layer"
    confidence: float = 1.0


@dataclass
class PatternMatch:
    doc_type_id: str
    pattern: str = ""
    score: float = 0.0
    start_pos: int = 0


@dataclass
class VisualPatterns:
    has_stamp: bool = False
    has_signature: bool = False
    has_photo_top_right: bool = False
    has_title_block: bool = False
    is_likely_title_page: bool = False
    is_likely_last_page: bool = False
    title_texts: list = None
    raw_blocks: list = None


@dataclass
class VLMResult:
    type_id: str = "undetected"
    confidence: float = 0.0
    raw_response: str | None = None


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    yield Session()


@pytest.fixture
def mock_ocr_module():
    m = MagicMock()
    m.extract_text.return_value = ""
    m.match_patterns.return_value = []
    return m


@pytest.fixture
def mock_cv_module():
    m = MagicMock()
    m.detect_visual_patterns.return_value = VisualPatterns()
    return m


@pytest.fixture
def mock_vlm_module():
    m = MagicMock()
    m.classify_page = AsyncMock(return_value=VLMResult(type_id="undetected", confidence=0.0))
    return m


@pytest.fixture
def settings():
    return Settings()
