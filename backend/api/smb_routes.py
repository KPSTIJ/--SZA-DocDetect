from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.services import smb_service

router = APIRouter(prefix="/smb", tags=["smb"])


class CreateFolderRequest(BaseModel):
    path: str = ""
    name: str = Field(..., min_length=1)


@router.get("/folders")
async def list_folders(request: Request, path: str = Query("", max_length=2000)):
    try:
        return smb_service.list_folders(request.app.state.settings, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMB error: {e}")


@router.post("/folders", status_code=201)
async def create_folder(request: Request, data: CreateFolderRequest):
    try:
        return smb_service.create_folder(request.app.state.settings, data.path, data.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMB error: {e}")
