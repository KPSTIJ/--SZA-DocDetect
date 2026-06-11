import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, JSON, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import relationship

from backend.database import Base


class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    text_patterns = Column(JSON, nullable=False, default=list)
    min_pages = Column(Integer, nullable=False, default=1)
    max_pages = Column(Integer, nullable=False, default=10)
    visual_hints = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    source_filename = Column(String(255), nullable=False)
    source_path = Column(String(500), nullable=False)
    status = Column(Enum("pending", "running", "done", "failed", "needs_review", name="job_status"), nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

    page_results = relationship("PageResult", back_populates="job", cascade="all, delete-orphan")
    output_documents = relationship("OutputDocument", back_populates="job", cascade="all, delete-orphan")


class PageResult(Base):
    __tablename__ = "page_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Uuid, ForeignKey("processing_jobs.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    document_type_id = Column(String, ForeignKey("document_types.id"), nullable=True)
    detection_method = Column(Enum("text_layer", "fusion", "vlm", "manual", name="detection_method"), nullable=True)
    confidence = Column(Float, nullable=True)
    error_code = Column(String(50), nullable=True)
    is_title_page = Column(Boolean, nullable=False, default=False)
    manual_override = Column(Boolean, nullable=False, default=False)

    job = relationship("ProcessingJob", back_populates="page_results")


class OutputDocument(Base):
    __tablename__ = "output_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Uuid, ForeignKey("processing_jobs.id"), nullable=False)
    document_type_id = Column(String, ForeignKey("document_types.id"), nullable=False)
    occurrence_index = Column(Integer, nullable=False, default=1)
    start_page = Column(Integer, nullable=False)
    end_page = Column(Integer, nullable=False)
    output_path = Column(String(500), nullable=True)
    status = Column(Enum("ok", "needs_review", "error", name="output_doc_status"), nullable=False, default="needs_review")

    job = relationship("ProcessingJob", back_populates="output_documents")
