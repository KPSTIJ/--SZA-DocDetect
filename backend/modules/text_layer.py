from dataclasses import dataclass, field


@dataclass
class TitlePageMatch:
    page_num: int
    doc_type_id: str
    matched_pattern: str
    confidence: float = 1.0


@dataclass
class PageAssignment:
    page_number: int
    doc_type_id: str | None = None
    is_title_page: bool = False
    error_code: str | None = None
    detection_method: str = "text_layer"
    confidence: float = 1.0


def find_title_pages_by_text(
    pages_text: list[dict],
    document_types: list,
) -> list[TitlePageMatch]:
    matches = []
    for page in pages_text:
        text_lower = page["text"].lower()
        for dt in document_types:
            for pattern in dt.text_patterns:
                if pattern.lower() in text_lower:
                    matches.append(TitlePageMatch(
                        page_num=page["page"],
                        doc_type_id=dt.id,
                        matched_pattern=pattern,
                    ))
                    break
    return matches


def assign_pages_from_title_pages(
    title_pages: list[TitlePageMatch],
    total_pages: int,
    document_types: dict[str, object],
) -> list[PageAssignment]:
    assignments = []
    title_pages.sort(key=lambda x: x.page_num)

    title_map: dict[int, str] = {tp.page_num: tp.doc_type_id for tp in title_pages}
    sorted_title_pages = sorted(title_map.keys())

    if not sorted_title_pages:
        for i in range(total_pages):
            assignments.append(PageAssignment(
                page_number=i, doc_type_id=None,
                error_code="undetected", detection_method="text_layer",
            ))
        return assignments

    first_title = sorted_title_pages[0]
    for i in range(first_title):
        assignments.append(PageAssignment(
            page_number=i, doc_type_id=None,
            error_code="undetected", detection_method="text_layer",
        ))

    for idx, title_page in enumerate(sorted_title_pages):
        next_title = sorted_title_pages[idx + 1] if idx + 1 < len(sorted_title_pages) else total_pages
        doc_type_id = title_map[title_page]
        dt = document_types.get(doc_type_id)
        seg_len = next_title - title_page

        error_code = None
        if dt:
            if seg_len < dt.min_pages or seg_len > dt.max_pages:
                error_code = "invalid_length"

        for i in range(title_page, next_title):
            assignments.append(PageAssignment(
                page_number=i,
                doc_type_id=doc_type_id,
                is_title_page=(i == title_page),
                error_code=error_code,
                detection_method="text_layer",
            ))

    return assignments
