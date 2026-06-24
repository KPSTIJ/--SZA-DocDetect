from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.db_models import DocumentType
from backend.models.schemas import DocumentTypeCreate, DocumentTypeUpdate, DocumentTypeResponse

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/document-types", response_model=list[DocumentTypeResponse])
async def list_document_types(project_id: UUID | None = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(DocumentType).order_by(DocumentType.name)
    if project_id:
        query = query.where(DocumentType.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/document-types", response_model=DocumentTypeResponse, status_code=201)
async def create_document_type(data: DocumentTypeCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.get(DocumentType, data.id)
    if existing:
        raise HTTPException(status_code=409, detail="Document type with this id already exists")
    doc_type = DocumentType(**data.model_dump())
    db.add(doc_type)
    await db.commit()
    await db.refresh(doc_type)
    return doc_type


@router.put("/document-types/{type_id}", response_model=DocumentTypeResponse)
async def update_document_type(type_id: str, data: DocumentTypeUpdate, db: AsyncSession = Depends(get_db)):
    doc_type = await db.get(DocumentType, type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc_type, key, value)
    await db.commit()
    await db.refresh(doc_type)
    return doc_type


@router.delete("/document-types/{type_id}", status_code=204)
async def delete_document_type(type_id: str, db: AsyncSession = Depends(get_db)):
    doc_type = await db.get(DocumentType, type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    await db.delete(doc_type)
    await db.commit()
