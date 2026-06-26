from datetime import datetime
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, model_validator


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class JobStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    needs_review = "needs_review"


class DetectionMethod(str, Enum):
    text_layer = "text_layer"
    fusion = "fusion"
    vlm = "vlm"
    manual = "manual"


class OutputDocumentStatus(str, Enum):
    ok = "ok"
    needs_review = "needs_review"
    error = "error"


class DocumentTypeCreate(BaseModel):
    id: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', description="slug-идентификатор")
    project_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=100)
    text_patterns: list[str] = Field(..., min_length=1)
    min_pages: int = Field(..., ge=1)
    max_pages: int = Field(..., ge=1)
    visual_hints: dict = Field(default_factory=dict)

    @model_validator(mode='after')
    def check_page_range(self):
        if self.max_pages < self.min_pages:
            raise ValueError("max_pages должен быть >= min_pages")
        return self


class DocumentTypeUpdate(BaseModel):
    name: str | None = None
    text_patterns: list[str] | None = None
    min_pages: int | None = Field(None, ge=1)
    max_pages: int | None = Field(None, ge=1)
    visual_hints: dict | None = None


class DocumentTypeResponse(BaseModel):
    id: str
    project_id: UUID | None = None
    name: str
    text_patterns: list[str]
    min_pages: int
    max_pages: int
    visual_hints: dict
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class JobUploadResponse(BaseModel):
    job_id: str
    filename: str
    status: JobStatus
    created_at: datetime


class JobSummary(BaseModel):
    job_id: str
    project_id: UUID | None = None
    batch_id: UUID | None = None
    source_filename: str
    status: JobStatus
    total_pages: int | None = None
    error_pages: int | None = None
    created_at: datetime
    finished_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class JobListResponse(BaseModel):
    items: list[JobSummary]
    total: int


class OutputDocumentResponse(BaseModel):
    id: int
    document_type_id: str
    document_type_name: str | None = None
    occurrence_index: int
    start_page: int
    end_page: int
    page_count: int = 0
    output_path: str | None = None
    output_filename: str | None = None
    status: OutputDocumentStatus
    model_config = ConfigDict(from_attributes=True)


class JobDetailResponse(BaseModel):
    job_id: str
    source_filename: str
    source_path: str
    status: JobStatus
    created_at: datetime
    finished_at: datetime | None = None
    error: str | None = None
    output_documents: list[OutputDocumentResponse]
    model_config = ConfigDict(from_attributes=True)


class PageResultResponse(BaseModel):
    page_number: int
    document_type_id: str | None = None
    document_type_name: str | None = None
    detection_method: DetectionMethod | None = None
    confidence: float | None = None
    error_code: str | None = None
    is_title_page: bool = False
    manual_override: bool = False
    model_config = ConfigDict(from_attributes=True)


class PageAssignmentItem(BaseModel):
    page_number: int
    document_type_id: str | None = None


class ReviewPatchRequest(BaseModel):
    assignments: list[PageAssignmentItem] = Field(..., min_length=1)


class ReviewConfirmResponse(BaseModel):
    job_id: str
    output_documents: list[OutputDocumentResponse]
    status: JobStatus


class ReviewStats(BaseModel):
    total_jobs: int = 0
    needs_review_count: int = 0
    done_count: int = 0
    failed_count: int = 0
    total_pages_processed: int = 0
    total_error_pages: int = 0


class ReviewJobsResponse(BaseModel):
    needs_review: list[JobSummary] = []
    done: list[JobSummary] = []
    failed: list[JobSummary] = []
    stats: ReviewStats
