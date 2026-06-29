# PDF Dossier Splitter

Automatic PDF splitting system for legal and financial dossiers. Upload multi-page PDF dossiers, automatically detect and split documents by type using multi-level ML pipeline (OCR + Layout analysis + VLM), review results in real-time UI, and save output to SMB network share.

## Architecture

```
Frontend (React + Ant Design + Vite)  →  Backend (Python + FastAPI)  →  ML Pipeline
                                                                →  SMB Network Share
                                                                →  SQLite DB
```

### Pipeline (multi-level escalation)

```
Text Layer (fuzzy pattern matching)
    ↓ (if undetected / errors)
FUSION — OCR (PaddleOCR) + CV (DocLayoutYOLO)
    ↓ (if still undetected / low confidence)
VLM (Qwen3VL-8b via Ollama)
    ↓ (if still low confidence)
Manual review
```

## Features

- **Auto-detection** of document types using text patterns, OCR, layout analysis, and vision-language model
- **Batch processing** — upload multiple PDFs at once, queue them, start with one click
- **Real-time UI** — progress bar, live status updates every 3 seconds, in-progress tab
- **Dossier review** — page-by-page preview, drag-free type reassignment, batch page operations
- **SMB output** — save split PDFs directly to a network share with folder browser
- **Dev console** — `Shift+Alt+M` opens live backend log panel
- **Dark/light theme**
- **Multi-project** — separate document types and jobs per project

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Ollama server with Qwen3VL-8b (or compatible VLM model)
- (optional) Windows SMB share for output storage

### Backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
pip install -r backend/requirements.ml.txt
cp .env.example .env
# Edit .env: set OLLAMA_BASE_URL, SMB_HOST/SMB_USERNAME/SMB_PASSWORD
uvicorn backend.main:app --host 0.0.0.0 --port 18000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Configuration

### Required `.env` variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OLLAMA_BASE_URL` | Ollama server URL | `http://192.168.1.100:11434` |
| `OLLAMA_MODEL` | VLM model name | `qwen3vl:8b` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:5173,http://192.168.1.6:5173` |

### SMB output storage

| Variable | Description |
|----------|-------------|
| `SMB_HOST` | SMB server IP |
| `SMB_SHARE` | Share name |
| `SMB_ROOT` | Root folder on the share (e.g. `cv_results`) |
| `SMB_USERNAME` | SMB username |
| `SMB_PASSWORD` | SMB password |

Credentials are stored ONLY in `.env` (not tracked by git). The `.env.example` has placeholders.

## Project Structure

```
├── backend/
│   ├── api/           # REST endpoints (config, jobs, review, project, SMB, logs)
│   ├── core/          # Pipeline orchestrator
│   ├── modules/       # text_layer, ocr, cv, fusion, vlm
│   ├── services/      # pdf_service, file_service, smb_service
│   ├── models/        # Pydantic schemas + SQLAlchemy ORM
│   └── tests/         # 15 unit tests
├── frontend/
│   ├── src/api/       # Axios API client
│   ├── src/store/     # Zustand state stores
│   └── src/components/ # React components
├── deploy/            # nginx, systemd, deploy script
└── main.py            # Entry point (run/test/e2e/pipeline)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/config/document-types` | List document types (per project) |
| POST | `/api/config/document-types` | Create document type |
| POST | `/api/jobs/upload` | Upload PDF |
| POST | `/api/jobs/start-batch` | Start processing queue |
| GET | `/api/jobs` | List jobs with filters |
| GET | `/api/jobs/{id}/pages` | Page-level results |
| GET | `/api/jobs/{id}/page/{n}/preview` | Page preview image |
| PATCH | `/api/review/jobs/{id}/pages` | Reassign page types |
| POST | `/api/review/jobs/{id}/confirm` | Confirm split and save |
| GET | `/api/smb/folders?path=` | Browse SMB folders |
| POST | `/api/smb/folders` | Create SMB folder |
| GET | `/api/logs` | Recent backend logs |

## Pipeline Flow

1. **Text Layer**: Pattern matching on embedded PDF text
2. **FUSION** (for scanned/no-text pages):
   - OCR via PaddleOCR (Russian language)
   - Layout detection via DocLayoutYOLO
   - Combined confidence scoring
3. **VLM**: Vision-Language model with page context (prev/next)
4. **Assembly**: Combine results, split PDF by document boundaries
5. **Output**: Save to SMB share `{SMB_ROOT}/{selected_folder}/{dossier_name}/`

## Known Issues

- PaddleOCR segfault on CPU without `FLAGS_use_mkldnn=0`
- VLM model must support image input (not all Ollama models do)
- SMB directory attributes may not be correctly reported (all entries shown as folders excluding `.` and `..`)

## License

Internal project.
