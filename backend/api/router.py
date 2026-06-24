from fastapi import APIRouter

from backend.api.config_routes import router as config_router
from backend.api.job_routes import router as job_router
from backend.api.review_routes import router as review_router
from backend.api.project_routes import router as project_router

router = APIRouter(prefix="/api")
router.include_router(config_router)
router.include_router(job_router)
router.include_router(review_router)
router.include_router(project_router)
