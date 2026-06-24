import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.utils import parse_job_id
from backend.database import get_db
from backend.models.db_models import ProcessingJob, PageResult, OutputDocument, DocumentType
from backend.models.schemas import (
    ReviewPatchRequest, ReviewConfirmResponse, ReviewJobsResponse,
    ReviewStats, JobSummary, OutputDocumentResponse, JobStatus, OutputDocumentStatus
)

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/jobs", response_model=ReviewJobsResponse)
async def list_review_jobs(
    project_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProcessingJob).options(selectinload(ProcessingJob.page_results))
    if project_id:
        query = query.where(ProcessingJob.project_id == project_id)
    query = query.order_by(ProcessingJob.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    all_jobs = result.scalars().all()
    needs_review = []
    done_jobs = []
    failed_jobs = []
    total_pages = 0
    total_error = 0
    for job in all_jobs:
        pages = job.page_results or []
        total_pages += len(pages)
        total_error += sum(1 for p in pages if p.error_code is not None)
        js = JobSummary(
            job_id=str(job.id),
            project_id=job.project_id,
            batch_id=job.batch_id,
            source_filename=job.source_filename,
            status=job.status,
            total_pages=len(pages),
            error_pages=sum(1 for p in pages if p.error_code is not None),
            created_at=job.created_at,
            finished_at=job.finished_at,
        )
        if job.status == JobStatus.needs_review:
            needs_review.append(js)
        elif job.status == JobStatus.done:
            done_jobs.append(js)
        elif job.status == JobStatus.failed:
            failed_jobs.append(js)
    return ReviewJobsResponse(
        needs_review=needs_review,
        done=done_jobs,
        failed=failed_jobs,
        stats=ReviewStats(
            total_jobs=len(all_jobs),
            needs_review_count=len(needs_review),
            done_count=len(done_jobs),
            failed_count=len(failed_jobs),
            total_pages_processed=total_pages,
            total_error_pages=total_error,
        ),
    )


@router.patch("/jobs/{job_id}/pages", status_code=200)
async def patch_job_pages(job_id: str, data: ReviewPatchRequest, db: AsyncSession = Depends(get_db)):
    job = await db.get(ProcessingJob, parse_job_id(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for item in data.assignments:
        result = await db.execute(
            select(PageResult).where(
                PageResult.job_id == parse_job_id(job_id),
                PageResult.page_number == item.page_number,
            )
        )
        page = result.scalar_one_or_none()
        if page:
            page.document_type_id = item.document_type_id
            page.detection_method = "manual"
            page.manual_override = True
            page.error_code = None
            page.confidence = 1.0
    await db.commit()
    return {"status": "ok"}


@router.post("/jobs/{job_id}/confirm", response_model=ReviewConfirmResponse)
async def confirm_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(ProcessingJob, parse_job_id(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from backend.core.orchestrator import DocumentOrchestrator
    from backend.config import Settings
    settings = Settings()
    orch = DocumentOrchestrator(db, settings)
    output_docs = await orch.assemble_after_review(job.id)
    from datetime import datetime
    job.status = JobStatus.done
    job.finished_at = datetime.utcnow()
    await db.commit()

    type_ids = list(set(doc.document_type_id for doc in output_docs if doc.document_type_id))
    doc_types_map = {}
    if type_ids:
        dt_result = await db.execute(select(DocumentType).where(DocumentType.id.in_(type_ids)))
        doc_types_map = {dt.id: dt.name for dt in dt_result.scalars().all()}

    result_docs = []
    for doc in output_docs:
        output_filename = os.path.basename(doc.output_path) if doc.output_path else None
        result_docs.append(OutputDocumentResponse(
            id=doc.id,
            document_type_id=doc.document_type_id,
            document_type_name=doc_types_map.get(doc.document_type_id),
            occurrence_index=doc.occurrence_index,
            start_page=doc.start_page,
            end_page=doc.end_page,
            page_count=doc.end_page - doc.start_page + 1,
            output_path=doc.output_path,
            output_filename=output_filename,
            status=doc.status,
        ))
    return ReviewConfirmResponse(
        job_id=str(job.id),
        output_documents=result_docs,
        status=job.status,
    )
