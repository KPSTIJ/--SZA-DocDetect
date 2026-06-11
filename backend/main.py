import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import Settings
from backend.database import Base, get_engine, get_sessionmaker
from backend.api.router import router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    logging.basicConfig(
        level=getattr(logging, settings.LOGGING_LEVEL.upper(), logging.INFO),
        format="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    for dir_path in [settings.INPUT_DIR, settings.OUTPUT_DIR, settings.TEMP_DIR]:
        Path(dir_path).mkdir(parents=True, exist_ok=True)

    engine = get_engine(settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app.state.engine = engine
    app.state.sessionmaker = get_sessionmaker(engine)
    app.state.settings = settings

    ocr_module = None
    cv_module = None
    vlm_module = None

    try:
        from backend.modules.ocr_module import OCRModule
        ocr_module = OCRModule()
        logger.info("OCRModule initialized")
    except Exception as e:
        logger.warning("OCRModule not available: %s", e)

    try:
        from backend.modules.cv_module import CVModule
        cv_module = CVModule()
        logger.info("CVModule initialized")
    except Exception as e:
        logger.warning("CVModule not available: %s", e)

    try:
        from backend.modules.vlm_module import VLMModule
        vlm_module = VLMModule(settings)
        logger.info("VLMModule initialized")
    except Exception as e:
        logger.warning("VLMModule not available: %s", e)

    app.state.ocr_module = ocr_module
    app.state.cv_module = cv_module
    app.state.vlm_module = vlm_module

    yield

    await engine.dispose()


app = FastAPI(title="PDF Dossier Splitter", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(FileNotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": "Файл не найден"})


app.include_router(router)


@app.get("/")
async def root(request: Request):
    return {
        "app": "PDF Dossier Splitter",
        "version": "1.0.0",
        "docs": "/docs",
        "ollama": str(getattr(request.app.state.settings, "OLLAMA_BASE_URL", "not configured")),
        "model": str(getattr(request.app.state.settings, "OLLAMA_MODEL", "not configured")),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}

