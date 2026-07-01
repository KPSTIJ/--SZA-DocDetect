import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import Settings
from backend.models.db_models import ProcessingJob, PageResult, OutputDocument, DocumentType, Project
from backend.modules.text_layer import (
    PageAssignment, find_title_pages_by_text, assign_pages_from_title_pages,
)
from backend.modules.fusion import combine_ocr_and_cv
from backend.modules.ocr_module import OCRModule
from backend.modules.cv_module import CVModule
from backend.modules.vlm_module import VLMModule
from backend.services.pdf_service import (
    extract_text_layer, render_page_to_image, enhance_for_ocr,
    enhance_for_cv, split_pdf, build_output_filename,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class DocumentOrchestrator:
    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        ocr_module: OCRModule | None = None,
        cv_module: CVModule | None = None,
        vlm_module: VLMModule | None = None,
    ):
        self.db = db
        self.settings = settings
        self.ocr_module = ocr_module
        self.cv_module = cv_module
        self.vlm_module = vlm_module

    async def process_job(self, job_id: uuid.UUID, next_job_ids: list[uuid.UUID] | None = None) -> None:
        job = await self.db.get(ProcessingJob, job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return
        logger.info("Job %s — starting processing", job_id)
        try:
            job.status = "running"
            job.finished_at = None
            await self.db.commit()
            await self._process_pipeline(job)
        except Exception as e:
            logger.error("Job %s — failed: %s", job_id, str(e), exc_info=True)
            job.status = "failed"
            job.error = str(e)
            await self.db.commit()

        if next_job_ids:
            next_id = next_job_ids[0]
            remaining = next_job_ids[1:]
            next_job = await self.db.get(ProcessingJob, next_id)
            if next_job and next_job.status == "pending":
                next_job.status = "running"
                await self.db.commit()
                await self.process_job(next_id, next_job_ids=remaining)

    async def _process_pipeline(self, job: ProcessingJob) -> None:
        pdf_path = job.source_path
        logging.getLogger().info("Job %s — pipeline started, pdf=%s via root", job.id, pdf_path)
        print(f"[DIRECT] pipeline started for {job.id}", file=__import__('sys').stderr, flush=True)
        logger.info("Job %s — pipeline started, pdf=%s", job.id, pdf_path)

        result = await self.db.execute(select(DocumentType))
        doc_types_orm = result.scalars().all()
        doc_types_dict = {dt.id: dt for dt in doc_types_orm}

        pages_text = await asyncio.to_thread(extract_text_layer, pdf_path)
        total_pages = len(pages_text)

        if total_pages == 0:
            raise ValueError("empty_pdf")

        text_pages = [p for p in pages_text if p["has_text_layer"]]
        scan_pages = [p for p in pages_text if not p["has_text_layer"]]
        logger.info("Job %s — %d pages, %d with text layer, %d scanned",
                     job.id, total_pages, len(text_pages), len(scan_pages))

        job.processing_stage = "text_layer"
        await self.db.commit()

        tl_assignments: dict[int, PageAssignment] = {}

        title_matches = find_title_pages_by_text(pages_text, doc_types_orm)
        logger.info("Job %s — text_layer found %d title pages", job.id, len(title_matches))
        tl_result = assign_pages_from_title_pages(
            title_matches, total_pages, doc_types_dict
        )
        for a in tl_result:
            tl_assignments[a.page_number] = a

        need_fusion: set[int] = set()
        for page_num in range(total_pages):
            if page_num in [p["page"] for p in scan_pages] and page_num not in tl_assignments:
                need_fusion.add(page_num)
            elif page_num in tl_assignments:
                a = tl_assignments[page_num]
                if a.error_code and a.error_code != "invalid_length":
                    need_fusion.add(page_num)
            else:
                need_fusion.add(page_num)

        fusion_assignments: dict[int, PageAssignment] = {}
        if need_fusion and self.ocr_module and self.cv_module:
            job.processing_stage = "ocr_cv"
            await self.db.commit()
            logger.info("Job %s — fusion processing %d pages", job.id, len(need_fusion))
            for page_num in sorted(need_fusion):
                raw_img = await asyncio.to_thread(
                    render_page_to_image, pdf_path, page_num, self.settings.PDF_RENDER_DPI
                )
                if raw_img is None:
                    logger.warning("Job %s — render_page_to_image returned None for page %d", job.id, page_num)
                    fusion_assignments[page_num] = PageAssignment(
                        page_number=page_num, doc_type_id=None, is_title_page=False,
                        error_code="undetected", detection_method="fusion", confidence=0.0,
                    )
                    continue
                ocr_img = await asyncio.to_thread(enhance_for_ocr, raw_img)
                cv_img = await asyncio.to_thread(enhance_for_cv, raw_img)

                ocr_text = await asyncio.to_thread(self.ocr_module.extract_text, ocr_img)
                ocr_matches = self.ocr_module.match_patterns(
                    ocr_text, doc_types_orm, self.settings.OCR_MATCH_THRESHOLD
                )
                best_ocr = max(ocr_matches, key=lambda m: m.score) if ocr_matches else None

                visual = await asyncio.to_thread(self.cv_module.detect_visual_patterns, cv_img)
                result_fusion = combine_ocr_and_cv(
                    best_ocr, visual, doc_types_orm, self.settings.OCR_MATCH_THRESHOLD
                )

                fusion_assignments[page_num] = PageAssignment(
                    page_number=page_num,
                    doc_type_id=result_fusion.doc_type_id,
                    is_title_page=(best_ocr is not None and best_ocr.score >= self.settings.OCR_MATCH_THRESHOLD),
                    error_code=result_fusion.error_code if not result_fusion.doc_type_id else None,
                    detection_method="fusion",
                    confidence=result_fusion.confidence,
                )
                logger.debug("Job %s — fusion page %d → type=%s conf=%.2f",
                             job.id, page_num, result_fusion.doc_type_id, result_fusion.confidence)

        need_vlm: set[int] = set()
        for page_num, a in fusion_assignments.items():
            if a.doc_type_id is None or a.confidence < self.settings.FUSION_VLM_ESCALATION_THRESHOLD:
                need_vlm.add(page_num)

        vlm_assignments: dict[int, PageAssignment] = {}
        if need_vlm and self.vlm_module:
            job.processing_stage = "vlm"
            await self.db.commit()
            logger.info("Job %s — vlm processing %d pages", job.id, len(need_vlm))
            rendered_cache: dict[int, np.ndarray | None] = {}

            async def get_img(n: int):
                if n not in rendered_cache:
                    if 0 <= n < total_pages:
                        rendered_cache[n] = await asyncio.to_thread(
                            render_page_to_image, pdf_path, n, self.settings.PDF_RENDER_DPI
                        )
                    else:
                        rendered_cache[n] = None
                return rendered_cache[n]

            running_context: list[PageAssignment] = []

            for page_num in sorted(need_vlm):
                vlm_result = await self.vlm_module.classify_page(
                    prev_image=await get_img(page_num - 1),
                    target_image=await get_img(page_num),
                    next_image=await get_img(page_num + 1),
                    document_types=doc_types_orm,
                    recent_context=running_context[-5:],
                )
                assignment = PageAssignment(
                    page_number=page_num,
                    doc_type_id=vlm_result.type_id if vlm_result.confidence >= self.settings.VLM_CONFIDENCE_THRESHOLD else None,
                    is_title_page=False,
                    error_code=None if vlm_result.confidence >= self.settings.VLM_CONFIDENCE_THRESHOLD else "low_vlm_confidence",
                    detection_method="vlm",
                    confidence=vlm_result.confidence,
                )
                vlm_assignments[page_num] = assignment
                running_context.append(assignment)
                logger.debug("Job %s — vlm page %d → type=%s conf=%.2f",
                             job.id, page_num, vlm_result.type_id, vlm_result.confidence)

        final_assignments: list[PageAssignment] = []
        for page_num in range(total_pages):
            if page_num in vlm_assignments:
                final_assignments.append(vlm_assignments[page_num])
            elif page_num in fusion_assignments:
                final_assignments.append(fusion_assignments[page_num])
            elif page_num in tl_assignments:
                final_assignments.append(tl_assignments[page_num])
            else:
                final_assignments.append(PageAssignment(
                    page_number=page_num,
                    doc_type_id=None,
                    is_title_page=False,
                    error_code="undetected",
                    detection_method="text_layer",
                    confidence=0.0,
                ))

        final_assignments = self._revalidate_lengths(final_assignments, doc_types_dict)

        await self._save_page_results(job.id, final_assignments)

        has_page_errors = any(
            a.error_code is not None
            for a in final_assignments
        )

        output_docs = self._assign_document_boundaries(final_assignments, doc_types_dict)
        await self._save_output_documents(job.id, output_docs)

        has_doc_problems = any(d["status"] != "ok" for d in output_docs)

        if not output_docs:
            job.status = "failed"
            job.error = "no_documents_recognized"
        elif has_page_errors or has_doc_problems:
            job.status = "needs_review"
        else:
            job.status = "done"

        if job.status == "done":
            ok_docs = [d for d in output_docs if d["status"] == "ok"]
            if ok_docs:
                job.processing_stage = "assembling"
                await self.db.commit()
            await self._assemble_pdfs(job, ok_docs)
            try:
                await self._save_final_output(job, ok_docs)
            except Exception as e:
                logger.error("Job %s — final output save failed: %s", job.id, str(e))

        job.processing_stage = None
        job.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db.commit()
        logger.info("Job %s — finished, status=%s", job.id, job.status)

    async def _save_final_output(self, job: ProcessingJob, ok_docs: list[dict]) -> None:
        project = await self.db.get(Project, job.project_id) if job.project_id else None
        if not project or project.final_output_dir is None:
            return
        from pathlib import Path
        stem = Path(job.source_filename).stem
        if self.settings.SMB_USERNAME and self.settings.SMB_PASSWORD:
            await self._save_to_smb(job, ok_docs, project.final_output_dir, stem)
        await self._save_to_local(job, ok_docs, project.final_output_dir, stem)

    async def _save_to_smb(self, job, ok_docs, rel_path: str, stem: str):
        from backend.services import smb_service
        import os
        subdir = f"{rel_path}/{stem}".strip("/") if rel_path else stem

        if job.source_path and os.path.exists(job.source_path):
            with open(job.source_path, "rb") as f:
                smb_service.save_file(self.settings, subdir, f"{stem}__MAIN.pdf", f.read())

        for doc in ok_docs:
            filename = build_output_filename(
                job.source_filename, doc["doc_type_id"], doc["occurrence_index"]
            )
            src = Path(self.settings.OUTPUT_DIR) / str(job.id) / filename
            if src.exists():
                with open(str(src), "rb") as f:
                    smb_service.save_file(self.settings, subdir, filename, f.read())
            odb = await self.db.execute(
                select(OutputDocument).where(
                    OutputDocument.job_id == job.id,
                    OutputDocument.document_type_id == doc["doc_type_id"],
                    OutputDocument.occurrence_index == doc["occurrence_index"],
                )
            )
            od = odb.scalar_one_or_none()
            if od:
                od.output_path = f"{subdir}/{filename}"
        await self.db.commit()
        logger.info("Job %s — saved to SMB: %s", job.id, subdir)

    async def _save_to_local(self, job, ok_docs, rel_path, stem):
        import shutil, os
        dest_dir = Path(rel_path) / stem if rel_path else Path(stem)
        dest_dir.mkdir(parents=True, exist_ok=True)

        main_dest = dest_dir / f"{stem}__MAIN.pdf"
        if job.source_path and os.path.exists(job.source_path):
            shutil.copy2(job.source_path, str(main_dest))

        for doc in ok_docs:
            filename = build_output_filename(
                job.source_filename, doc["doc_type_id"], doc["occurrence_index"]
            )
            src = Path(self.settings.OUTPUT_DIR) / str(job.id) / filename
            if src.exists():
                shutil.copy2(str(src), str(dest_dir / filename))
                odb = await self.db.execute(
                    select(OutputDocument).where(
                        OutputDocument.job_id == job.id,
                        OutputDocument.document_type_id == doc["doc_type_id"],
                        OutputDocument.occurrence_index == doc["occurrence_index"],
                    )
                )
                od = odb.scalar_one_or_none()
                if od:
                    od.output_path = str(dest_dir / filename)
        await self.db.commit()
        logger.info("Job %s — saved to local: %s", job.id, dest_dir)

    def _revalidate_lengths(
        self,
        assignments: list[PageAssignment],
        doc_types: dict[str, any],
    ) -> list[PageAssignment]:
        import copy
        assignments = [copy.copy(a) for a in assignments]
        segments = []
        current_type = None
        current_segment = []
        for a in sorted(assignments, key=lambda x: x.page_number):
            if a.doc_type_id != current_type or (a.is_title_page and current_segment):
                if current_segment:
                    segments.append(current_segment)
                current_segment = [a]
                current_type = a.doc_type_id
            else:
                current_segment.append(a)
        if current_segment:
            segments.append(current_segment)

        result = []
        for seg in segments:
            type_id = seg[0].doc_type_id
            if type_id and type_id in doc_types:
                dt = doc_types[type_id]
                length = len(seg)
                if hasattr(dt, "min_pages") and hasattr(dt, "max_pages"):
                    if not (dt.min_pages <= length <= dt.max_pages):
                        for a in seg:
                            a.error_code = "invalid_length"
            result.extend(seg)
        return result

    async def _save_page_results(self, job_id: uuid.UUID, assignments: list[PageAssignment]) -> None:
        for a in assignments:
            pr = PageResult(
                job_id=job_id,
                page_number=a.page_number,
                document_type_id=a.doc_type_id,
                detection_method=a.detection_method,
                confidence=a.confidence,
                error_code=a.error_code,
                is_title_page=a.is_title_page,
            )
            self.db.add(pr)
        await self.db.commit()

    async def _save_output_documents(self, job_id: uuid.UUID, docs: list) -> None:
        for doc in docs:
            od = OutputDocument(
                job_id=job_id,
                document_type_id=doc["doc_type_id"],
                occurrence_index=doc["occurrence_index"],
                start_page=doc["start_page"],
                end_page=doc["end_page"],
                status=doc["status"],
            )
            self.db.add(od)
        await self.db.commit()

    def _assign_document_boundaries(
        self, page_assignments: list[PageAssignment], doc_types_dict: dict[str, any] | None = None
    ) -> list[dict]:
        if not page_assignments:
            return []
        docs = []
        current_type = page_assignments[0].doc_type_id
        current_start = 0
        occurrence: dict[str, int] = {}
        has_error = False

        def add_doc(start, end):
            nonlocal current_type, occurrence
            length = end - start + 1
            dt = doc_types_dict.get(current_type) if doc_types_dict else None
            if dt and hasattr(dt, 'min_pages') and hasattr(dt, 'max_pages') and length > dt.max_pages:
                for cs in range(start, end + 1, dt.max_pages):
                    ce = min(cs + dt.max_pages - 1, end)
                    cl = ce - cs + 1
                    chunk_ok = dt.min_pages <= cl <= dt.max_pages
                    if chunk_ok:
                        for p in page_assignments:
                            if cs <= p.page_number <= ce:
                                p.error_code = None
                    if current_type not in occurrence:
                        occurrence[current_type] = 0
                    occurrence[current_type] += 1
                    docs.append({
                        "doc_type_id": current_type,
                        "occurrence_index": occurrence[current_type],
                        "start_page": cs,
                        "end_page": ce,
                        "status": "ok" if chunk_ok else "needs_review",
                    })
            else:
                if current_type not in occurrence:
                    occurrence[current_type] = 0
                occurrence[current_type] += 1
                docs.append({
                    "doc_type_id": current_type,
                    "occurrence_index": occurrence[current_type],
                    "start_page": start,
                    "end_page": end,
                    "status": "needs_review" if has_error else "ok",
                })

        for i, a in enumerate(page_assignments):
            if a.doc_type_id != current_type or (a.is_title_page and i > current_start):
                if current_type is not None:
                    add_doc(current_start, i - 1)
                current_type = a.doc_type_id
                current_start = i
                has_error = False

            if a.error_code:
                has_error = True

        if current_type is not None:
            add_doc(current_start, len(page_assignments) - 1)

        return docs

    async def _assemble_pdfs(
        self, job: ProcessingJob, output_docs: list[dict]
    ) -> None:
        for doc in output_docs:
            if doc["status"] != "ok":
                continue
            filename = build_output_filename(
                job.source_filename, doc["doc_type_id"], doc["occurrence_index"]
            )
            output_path = f"{self.settings.OUTPUT_DIR}/{job.id}/{filename}"
            await asyncio.to_thread(
                split_pdf, job.source_path, output_path,
                doc["start_page"], doc["end_page"],
            )
            odb = await self.db.execute(
                select(OutputDocument).where(
                    OutputDocument.job_id == job.id,
                    OutputDocument.document_type_id == doc["doc_type_id"],
                    OutputDocument.occurrence_index == doc["occurrence_index"],
                )
            )
            od = odb.scalar_one_or_none()
            if od:
                od.output_path = output_path
        await self.db.commit()

    async def assemble_after_review(self, job_id: uuid.UUID) -> list[OutputDocument]:
        job = await self.db.get(ProcessingJob, job_id)
        result = await self.db.execute(
            select(PageResult).where(PageResult.job_id == job_id).order_by(PageResult.page_number)
        )
        dt_result = await self.db.execute(select(DocumentType))
        doc_types_dict = {dt.id: dt for dt in dt_result.scalars().all()}
        pages = result.scalars().all()
        assignments = []
        for p in pages:
            assignments.append(PageAssignment(
                page_number=p.page_number,
                doc_type_id=p.document_type_id,
                is_title_page=p.is_title_page,
                error_code=p.error_code,
                detection_method=p.detection_method or "manual",
                confidence=p.confidence or 1.0,
            ))
        docs = self._assign_document_boundaries(assignments, doc_types_dict)
        await self._assemble_pdfs(job, docs)
        ok_docs = [d for d in docs if d["status"] == "ok"]
        try:
            await self._save_final_output(job, ok_docs)
        except Exception as e:
            logger.error("Job %s — final output save failed: %s", job.id, str(e))
        result = await self.db.execute(
            select(OutputDocument).where(OutputDocument.job_id == job_id)
        )
        return result.scalars().all()
