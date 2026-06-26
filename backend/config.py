from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    INPUT_DIR: str = "./data/input"
    OUTPUT_DIR: str = "./data/output"
    TEMP_DIR: str = "./data/temp"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3-vl:8b"

    OCR_MATCH_THRESHOLD: float = 0.87
    VLM_CONFIDENCE_THRESHOLD: float = 0.70

    PDF_RENDER_DPI: int = 200
    OCR_ENHANCE: bool = True
    CV_ENHANCE: bool = True

    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"

    CORS_ORIGINS: str = "http://localhost:5173"

    LOGGING_LEVEL: str = "INFO"

    MAX_UPLOAD_SIZE_MB: int = 100

    model_config = SettingsConfigDict(env_file=".env")
