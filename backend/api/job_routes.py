import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db, get_sessionmaker
from backend.models.db_models import ProcessingJob, PageResult, OutputDocument, DocumentType
from backend.models.schemas import (
    JobUploadResponse, JobListResponse, JobSummary, JobDetailResponse,
    PageResultResponse, OutputDocumentResponse, JobStatus
)
from backend.services.file_service import save_uploaded_file


def _parse_job_id(job_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid job ID format")


async def _run_orchestrator(job_id: uuid.UUID, request: Request):
    from backend.core.orchestrator import DocumentOrchestrator
    async with request.app.state.sessionmaker() as db:
        orch = DocumentOrchestrator(
            db=db,
            settings=request.app.state.settings,
            ocr_module=request.app.state.ocr_module,
            cv_module=request.app.state.cv_module,
            vlm_module=request.app.state.vlm_module,
        )
        await orch.process_job(job_id)

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/upload", response_model=JobUploadResponse, status_code=201)
async def upload_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    job_id = uuid.uuid4()
    source_path = await save_uploaded_file(job_id, file)
    job = ProcessingJob(
        id=job_id,
        source_filename=file.filename,
        source_path=str(source_path),
        status=JobStatus.pending,
        created_at=datetime.utcnow(),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_run_orchestrator, job.id, request)

    return JobUploadResponse(
        job_id=str(job.id),
        filename=job.source_filename,
        status=job.status,
        created_at=job.created_at,
    )


@router.post("/start-batch", status_code=200)
async def start_batch(background_tasks: BackgroundTasks, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProcessingJob).where(ProcessingJob.status == JobStatus.pending)
    )
    jobs = result.scalars().all()
    if not jobs:
        raise HTTPException(status_code=400, detail="No pending jobs found")
    for job in jobs:
        job.status = JobStatus.running
    await db.commit()

    for job in jobs:
        background_tasks.add_task(_run_orchestrator, job.id, request)

    return {"started": len(jobs)}


@router.get("", response_model=JobListResponse)
async def list_jobs(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(ProcessingJob).options(selectinload(ProcessingJob.page_results))
    count_query = select(func.count(ProcessingJob.id))
    if status:
        query = query.where(ProcessingJob.status == status)
        count_query = count_query.where(ProcessingJob.status == status)
    query = query.order_by(ProcessingJob.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    jobs = result.scalars().all()
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    items = []
    for job in jobs:
        pages = job.page_results or []
        total_pages = len(pages)
        error_pages = sum(1 for p in pages if p.error_code is not None)
        items.append(JobSummary(
            job_id=str(job.id),
            source_filename=job.source_filename,
            status=job.status,
            total_pages=total_pages,
            error_pages=error_pages,
            created_at=job.created_at,
            finished_at=job.finished_at,
        ))
    return JobListResponse(items=items, total=total or 0)


@router.get("/{job_id}", response_model=JobDetailResponse)
async def get_job_detail(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProcessingJob)
        .options(selectinload(ProcessingJob.output_documents))
        .where(ProcessingJob.id == _parse_job_id(job_id))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    type_ids = list(set(d.document_type_id for d in (job.output_documents or [])))
    doc_types_map = {}
    if type_ids:
        dt_result = await db.execute(select(DocumentType).where(DocumentType.id.in_(type_ids)))
        doc_types_map = {dt.id: dt.name for dt in dt_result.scalars().all()}
    output_docs = []
    for doc in (job.output_documents or []):
        output_docs.append(OutputDocumentResponse(
            id=doc.id,
            document_type_id=doc.document_type_id,
            document_type_name=doc_types_map.get(doc.document_type_id),
            occurrence_index=doc.occurrence_index,
            start_page=doc.start_page,
            end_page=doc.end_page,
            page_count=doc.end_page - doc.start_page + 1,
            output_path=doc.output_path,
            status=doc.status,
        ))
    return JobDetailResponse(
        job_id=str(job.id),
        source_filename=job.source_filename,
        source_path=job.source_path,
        status=job.status,
        created_at=job.created_at,
        finished_at=job.finished_at,
        error=job.error,
        output_documents=output_docs,
    )


@router.get("/{job_id}/pages", response_model=list[PageResultResponse])
async def get_job_pages(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(ProcessingJob, _parse_job_id(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    result = await db.execute(
        select(PageResult).where(PageResult.job_id == _parse_job_id(job_id)).order_by(PageResult.page_number)
    )
    pages = result.scalars().all()
    type_ids = list(set(p.document_type_id for p in pages if p.document_type_id))
    doc_types_map = {}
    if type_ids:
        dt_result = await db.execute(select(DocumentType).where(DocumentType.id.in_(type_ids)))
        doc_types_map = {dt.id: dt.name for dt in dt_result.scalars().all()}
    response = []
    for p in pages:
        response.append(PageResultResponse(
            page_number=p.page_number,
            document_type_id=p.document_type_id,
            document_type_name=doc_types_map.get(p.document_type_id),
            detection_method=p.detection_method,
            confidence=p.confidence,
            error_code=p.error_code,
            is_title_page=p.is_title_page,
            manual_override=p.manual_override,
        ))
    return response


@router.get("/{job_id}/page/{page_num}/preview")
async def get_page_preview(job_id: str, page_num: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(ProcessingJob, _parse_job_id(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from backend.services.file_service import render_and_cache_preview
    preview_path = render_and_cache_preview(job.source_path, job_id, page_num, dpi=100)
    if not preview_path:
        raise HTTPException(status_code=404, detail="Page not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(preview_path), media_type="image/jpeg")


@router.get("/{job_id}/source")
async def stream_source_pdf(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(ProcessingJob, _parse_job_id(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from fastapi.responses import FileResponse
    return FileResponse(job.source_path, media_type="application/pdf", filename=job.source_filename)


@router.get("/{job_id}/output/{doc_id}")
async def stream_output_pdf(job_id: str, doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(OutputDocument, doc_id)
    if not doc or str(doc.job_id) != job_id:
        raise HTTPException(status_code=404, detail="Output document not found")
    if not doc.output_path:
        raise HTTPException(status_code=404, detail="Output file not yet generated")
    from fastapi.responses import FileResponse
    return FileResponse(doc.output_path, media_type="application/pdf")
