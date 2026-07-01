from backend.services.pdf_service import build_output_filename, split_pdf, extract_text_layer
from pathlib import Path


def test_build_output_filename_single():
    result = build_output_filename("dossier.pdf", "passport", occurrence=1)
    assert result == "dossier_passport_1.pdf"


def test_build_output_filename_multiple():
    result = build_output_filename("dossier.pdf", "passport", occurrence=2)
    assert result == "dossier_passport_2.pdf"


def test_build_output_filename_stem():
    result = build_output_filename("my.file.name.pdf", "contract", occurrence=1)
    assert result == "my.file.name_contract_1.pdf"
