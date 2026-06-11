# СПЕЦИФИКАЦИЯ: Система автоматического разрезания PDF-досье

> **Приоритет**: точность распознавания, а не скорость обработки.

---

## ОБЩАЯ АРХИТЕКТУРА

```
frontend/          React + Ant Design + Vite
backend/           Python + FastAPI
  ├── api/         REST-эндпоинты
  ├── core/        Оркестратор пайплайна
  ├── modules/
  │   ├── text_layer/   Обработка текстового слоя
  │   ├── ocr/          PaddleOCR
  │   ├── cv/           DocLayoutYOLO
  │   └── vlm/          Qwen3VL-8b через Ollama
  ├── services/
  │   ├── pdf_service.py
  │   └── file_service.py
  └── models/      Pydantic-схемы и БД-модели
```

**БД**: SQLite (через SQLAlchemy) — для хранения конфигов, статусов задач и результатов.  
**Очередь задач**: встроенная async-очередь через FastAPI BackgroundTasks (или Celery+Redis если нужна персистентность).  
**Файловое хранилище**: локальная FS, пути настраиваются в конфиге.

---

## ПОДЗАДАЧА 1 — Инфраструктура и базовые модели

### 1.1 Структура проекта

Создать полную структуру директорий:

```
project/
├── backend/
│   ├── main.py
│   ├── config.py               # pydantic-settings, читает .env
│   ├── database.py             # SQLAlchemy init, Base, get_db
│   ├── models/
│   │   ├── __init__.py
│   │   ├── db_models.py        # ORM-модели
│   │   └── schemas.py          # Pydantic-схемы для API
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py           # Главный роутер
│   │   ├── config_routes.py    # CRUD конфигов документов
│   │   ├── job_routes.py       # Запуск/статус задач
│   │   └── review_routes.py    # Ручная валидация
│   ├── core/
│   │   ├── __init__.py
│   │   └── orchestrator.py     # Главный пайплайн
│   ├── modules/
│   │   ├── text_layer.py
│   │   ├── ocr_module.py
│   │   ├── cv_module.py
│   │   └── vlm_module.py
│   ├── services/
│   │   ├── pdf_service.py
│   │   └── file_service.py
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/                # axios-клиент и хуки
│       ├── components/
│       │   ├── Settings/
│       │   └── Review/
│       └── store/              # Zustand или Context
└── .env.example
```

### 1.2 БД-модели (`db_models.py`)

```python
# DocumentType — настройки типов документов
class DocumentType(Base):
    id: str                      # alias (slug), PK
    name: str                    # человекочитаемое название
    text_patterns: JSON          # список строк-паттернов для поиска
    min_pages: int
    max_pages: int
    visual_hints: JSON           # подсказки для CV (опционально)
    created_at: datetime
    updated_at: datetime

# ProcessingJob — задача обработки одного PDF
class ProcessingJob(Base):
    id: UUID, PK
    source_filename: str         # оригинальное имя файла
    source_path: str             # путь к исходнику
    status: Enum                 # pending | running | done | failed | needs_review
    created_at: datetime
    finished_at: datetime | None
    error: str | None

# PageResult — результат обработки одной страницы
class PageResult(Base):
    id: int, PK
    job_id: UUID, FK
    page_number: int             # 0-indexed
    document_type_id: str | None # FK → DocumentType.id, NULL = undetected
    detection_method: Enum       # text_layer | fusion | vlm | manual
    confidence: float | None
    error_code: str | None       # invalid_length | undetected | etc.
    is_title_page: bool
    manual_override: bool

# OutputDocument — итоговый PDF-файл
class OutputDocument(Base):
    id: int, PK
    job_id: UUID, FK
    document_type_id: str
    occurrence_index: int        # порядковый номер, если тип встречается >1 раза
    start_page: int
    end_page: int
    output_path: str | None
    status: Enum                 # ok | needs_review | error
```

### 1.3 `config.py`

```python
class Settings(BaseSettings):
    # Пути
    INPUT_DIR: str = "./data/input"
    OUTPUT_DIR: str = "./data/output"
    TEMP_DIR: str = "./data/temp"

    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3vl:8b"

    # Пороги
    OCR_MATCH_THRESHOLD: float = 0.87  # порог fuzzy-match для OCR-текста
    VLM_CONFIDENCE_THRESHOLD: float = 0.70  # ниже — уходит на ручную проверку

    # Обработка изображений
    PDF_RENDER_DPI: int = 200      # DPI для рендеринга страниц в изображения
    OCR_ENHANCE: bool = True
    CV_ENHANCE: bool = True

    DATABASE_URL: str = "sqlite:///./app.db"
    model_config = SettingsConfigDict(env_file=".env")
```

### 1.4 `requirements.txt`

```
fastapi>=0.111
uvicorn[standard]
sqlalchemy>=2.0
alembic
pydantic-settings
pydantic>=2
pymupdf           # fitz — для работы с PDF и рендеринга страниц
paddleocr
paddlepaddle
opencv-python-headless
numpy
Pillow
httpx             # для запросов к Ollama
rapidfuzz         # fuzzy-matching для OCR
python-multipart  # для загрузки файлов через FastAPI
```

**Задача**: установить все зависимости, запустить `alembic init`, создать первую миграцию, убедиться что `uvicorn main:app --reload` стартует без ошибок.

---

## ПОДЗАДАЧА 2 — API конфигурации и файлов

### 2.1 CRUD для типов документов (`config_routes.py`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/config/document-types` | Список всех типов |
| POST | `/api/config/document-types` | Создать тип |
| PUT | `/api/config/document-types/{id}` | Обновить тип |
| DELETE | `/api/config/document-types/{id}` | Удалить тип |

**Тело POST/PUT:**
```json
{
  "id": "credit_agreement",
  "name": "Кредитный договор",
  "text_patterns": ["кредитный договор", "договор №", "КРЕДИТНЫЙ ДОГОВОР"],
  "min_pages": 1,
  "max_pages": 10,
  "visual_hints": {}
}
```

### 2.2 Управление задачами (`job_routes.py`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/jobs/upload` | Загрузить PDF и создать задачу |
| POST | `/api/jobs/start-batch` | Запустить все pending-задачи |
| GET | `/api/jobs` | Список задач с фильтрами |
| GET | `/api/jobs/{job_id}` | Статус и детали задачи |
| GET | `/api/jobs/{job_id}/pages` | Постраничные результаты |
| GET | `/api/jobs/{job_id}/source` | Стриминг исходного PDF |
| GET | `/api/jobs/{job_id}/output/{doc_id}` | Стриминг выходного PDF |
| GET | `/api/jobs/{job_id}/page/{page_num}/preview` | PNG-превью страницы |

**Загрузка**: `multipart/form-data`, поле `file`. Файл сохраняется в `INPUT_DIR/{job_id}/original.pdf`. Создаётся запись `ProcessingJob` со статусом `pending`.

### 2.3 Review API (`review_routes.py`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/review/jobs` | Задачи требующие ревью (status=needs_review) |
| PATCH | `/api/review/jobs/{job_id}/pages` | Переназначить типы страниц |
| POST | `/api/review/jobs/{job_id}/confirm` | Подтвердить разрезание и склеить |

**PATCH body:**
```json
{
  "assignments": [
    {"page_number": 6, "document_type_id": "passport"},
    {"page_number": 7, "document_type_id": "passport"}
  ]
}
```

---

## ПОДЗАДАЧА 3 — PDF-сервис и рендеринг

**Файл**: `services/pdf_service.py`

Реализовать следующие функции (все используют `pymupdf`/`fitz`):

```python
def extract_text_layer(pdf_path: str) -> list[dict]:
    """
    Возвращает список по страницам:
    [{"page": 0, "text": "...", "has_text_layer": bool}, ...]
    has_text_layer=False если текст пустой или < 50 символов
    """

def render_page_to_image(pdf_path: str, page_num: int, dpi: int) -> np.ndarray:
    """Рендерит страницу в numpy array (RGB)"""

def enhance_for_ocr(image: np.ndarray) -> np.ndarray:
    """
    Предобработка под OCR:
    - конвертация в grayscale
    - CLAHE (выравнивание гистограммы)
    - адаптивная бинаризация Otsu
    - denoise
    """

def enhance_for_cv(image: np.ndarray) -> np.ndarray:
    """
    Предобработка под CV:
    - нормализация яркости
    - увеличение контраста
    - сохранение цвета (не grayscale)
    """

def split_pdf(source_path: str, output_path: str, start_page: int, end_page: int) -> str:
    """Вырезает страницы [start_page, end_page] включительно, сохраняет в output_path"""

def build_output_filename(source_name: str, doc_type: str, occurrence: int) -> str:
    """
    Формат: {source_stem}_{doc_type}[_{occurrence}].pdf
    occurrence добавляется только если > 1
    """
```

---

## ПОДЗАДАЧА 4 — Модуль обработки текстового слоя

**Файл**: `modules/text_layer.py`

### Логика

```python
def find_title_pages_by_text(
    pages_text: list[dict],           # из pdf_service.extract_text_layer
    document_types: list[DocumentType]
) -> list[TitlePageMatch]:
    """
    Для каждой страницы проверяет: содержит ли её текст
    хотя бы один из паттернов любого типа документа.
    Возвращает список совпадений: [{page_num, doc_type_id, matched_pattern}]
    Используется точное строковое вхождение (str.lower()).
    """

def assign_pages_from_title_pages(
    title_pages: list[TitlePageMatch],
    total_pages: int,
    document_types: dict[str, DocumentType]
) -> list[PageAssignment]:
    """
    Разбивает PDF на сегменты по титульникам.
    Правила:
    1. Если первый титульник не на стр.0 → страницы [0, first_title-1] → type="undetected"
    2. Каждый тип тянется от своего титульника до начала следующего-1
    3. Для каждого сегмента проверяет min_pages/max_pages → error_code="invalid_length"
    """
```

**Возвращаемая структура `PageAssignment`**:
```python
@dataclass
class PageAssignment:
    page_number: int
    doc_type_id: str | None   # None = undetected
    is_title_page: bool
    error_code: str | None    # "invalid_length" | "undetected" | None
    detection_method: str = "text_layer"
    confidence: float = 1.0
```

---

## ПОДЗАДАЧА 5 — FUSION-модуль (OCR + CV)

**Файл**: `modules/ocr_module.py`

```python
class OCRModule:
    def __init__(self):
        # Инициализация PaddleOCR с lang='ru'
        self.ocr = PaddleOCR(use_angle_cls=True, lang='ru', show_log=False)

    def extract_text(self, image: np.ndarray) -> str:
        """Запускает OCR, возвращает склеенный текст всех блоков"""

    def match_patterns(
        self,
        ocr_text: str,
        patterns: list[str],
        threshold: float = 0.87
    ) -> list[PatternMatch]:
        """
        Fuzzy-matching через rapidfuzz.
        Для каждого паттерна ищет лучшее вхождение в тексте.
        Возвращает совпадения выше threshold.
        """
```

**Файл**: `modules/cv_module.py`

```python
class CVModule:
    def __init__(self):
        # Загрузка DocLayoutYOLO модели
        # Модель детектирует layout-блоки: figure, table, text, title, etc.
        ...

    def detect_layout(self, image: np.ndarray) -> list[LayoutBlock]:
        """
        Возвращает список блоков с полями:
        {type: str, bbox: [x1,y1,x2,y2], confidence: float}
        """

    def detect_visual_patterns(self, image: np.ndarray) -> VisualPatterns:
        """
        Анализирует результаты detect_layout и возвращает:
        {
            has_stamp: bool,          # есть круглая печать (figure в нижней части)
            has_signature: bool,      # есть подпись (figure в нижних 30% страницы)
            has_photo_top_right: bool,# фото в правом верхнем углу (признак паспорта)
            title_blocks: list,       # крупные text/title блоки в верхней части
            is_likely_last_page: bool # stamp + signature присутствуют
        }
        """
```

**Файл**: `modules/fusion.py`

```python
async def fusion_analyze_page(
    image: np.ndarray,
    document_types: list[DocumentType],
    ocr_module: OCRModule,
    cv_module: CVModule,
    config: Settings
) -> PageAssignment:
    """
    1. Параллельный запуск OCR и CV (asyncio.gather)
    2. OCR: ищет паттерны → возможный тип
    3. CV: ищет визуальные признаки → подтверждение/опровержение
    4. Объединяет результаты:
       - Если OCR нашёл тип И CV подтверждает → высокая уверенность
       - Если только OCR → средняя уверенность  
       - Если только CV (печать/подпись) → помечает как "конец документа"
       - Если ничего → undetected
    5. Возвращает PageAssignment с detection_method="fusion"
    """
```

---

## ПОДЗАДАЧА 6 — VLM-модуль

**Файл**: `modules/vlm_module.py`

```python
import base64, httpx
from PIL import Image
import io

WHITE_PAGE_BASE64: str  # константа — белое изображение 800x1000px в base64

PROMPT_TEMPLATE = """Ты классификатор документов. Тебе переданы три изображения страниц из отсканированного PDF.
ЦЕЛЕВАЯ СТРАНИЦА: второе изображение (индекс 1).
Первое и третье изображения — соседние страницы для контекста.

Контекст предыдущих страниц: {context}
Доступные типы документов: {doc_types}

Определи тип документа на ЦЕЛЕВОЙ странице.
Верни строго JSON без пояснений: {{"type": "<id>", "confidence": <0.0-1.0>}}
Если не можешь определить — верни {{"type": "undetected", "confidence": 0.0}}"""

class VLMModule:
    def __init__(self, settings: Settings):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL

    def _image_to_base64(self, image: np.ndarray) -> str:
        """np.ndarray → base64 JPEG string"""

    def _build_context_string(self, recent_pages: list[PageAssignment]) -> str:
        """Последние 5 страниц → строка "стр.N: тип (conf: X.XX)" """

    def _build_doc_types_string(self, doc_types: list[DocumentType]) -> str:
        """[id: название, ...] строка для промпта"""

    async def classify_page(
        self,
        prev_image: np.ndarray | None,    # None → белая страница
        target_image: np.ndarray,
        next_image: np.ndarray | None,    # None → белая страница
        document_types: list[DocumentType],
        recent_context: list[PageAssignment]
    ) -> VLMResult:
        """
        Формирует запрос к Ollama /api/chat с тремя изображениями в base64.
        Парсит JSON-ответ.
        
        Структура запроса к Ollama:
        POST {OLLAMA_BASE_URL}/api/chat
        {
          "model": "qwen3vl:8b",
          "stream": false,
          "messages": [{
            "role": "user",
            "content": PROMPT,
            "images": [base64_prev, base64_target, base64_next]
          }]
        }
        
        Возвращает VLMResult(type_id, confidence, raw_response)
        При ошибке парсинга → type_id="undetected", confidence=0.0
        """
```

---

## ПОДЗАДАЧА 7 — Оркестратор пайплайна

**Файл**: `core/orchestrator.py`

Это центральный класс, который управляет полным пайплайном для одного `ProcessingJob`.

```python
class DocumentOrchestrator:
    def __init__(self, db, settings, ocr_module, cv_module, vlm_module):
        ...

    async def process_job(self, job_id: UUID) -> None:
        """
        Обновляет job.status = "running"
        Вызывает _process_pipeline()
        При любом исключении → job.status = "failed", job.error = str(e)
        """

    async def _process_pipeline(self, job: ProcessingJob) -> None:
        """
        Шаг 1: Извлечь текстовый слой всех страниц
        Шаг 2: Определить страницы БЕЗ текстового слоя
        Шаг 3: Для страниц С текстовым слоем → text_layer_module.assign_pages()
        Шаг 4: Проверить результаты text_layer:
                - страницы с ошибками → идут на FUSION
                - undetected страницы → идут на FUSION
        Шаг 5: FUSION для проблемных страниц + страниц без текстового слоя
        Шаг 6: После FUSION снова проверить ошибки → проблемные идут на VLM
        Шаг 7: VLM для оставшихся проблемных
        Шаг 8: После VLM — если confidence < threshold → needs_review, иначе склейка
        Шаг 9: _save_page_results() — сохранить все PageResult в БД
        Шаг 10: _build_output_documents() — определить границы документов и создать OutputDocument записи
        Шаг 11: _assemble_pdfs() — физически склеить PDF файлы для ОК-документов
        Шаг 12: Если есть needs_review → job.status = "needs_review", иначе "done"
        """

    def _assign_document_boundaries(
        self, page_assignments: list[PageAssignment]
    ) -> list[OutputDocument]:
        """
        Группирует последовательные страницы одного типа в документы.
        Считает occurrence_index если тип встречается несколько раз.
        Документы с error_code → status="needs_review"
        """

    async def _assemble_pdfs(
        self, job: ProcessingJob, output_docs: list[OutputDocument]
    ) -> None:
        """
        Для каждого OutputDocument со status="ok":
        - вызывает pdf_service.split_pdf()
        - сохраняет путь в output_doc.output_path
        """

    async def assemble_after_review(self, job_id: UUID) -> None:
        """
        Вызывается после ручного подтверждения.
        Пересчитывает границы документов по актуальным PageResult
        (учитывая manual_override=True) и склеивает PDF.
        """
```

---

## ПОДЗАДАЧА 8 — Frontend: скелет приложения и Settings-экран

**Стек**: React 18 + Ant Design 5 + Vite + Zustand (стейт) + Axios (запросы)

### 8.1 Общая структура

```
src/
├── main.jsx
├── App.jsx              # два таба: Settings | Review
├── api/
│   ├── client.js        # axios instance с baseURL из env
│   ├── configApi.js     # CRUD document types
│   └── jobsApi.js       # jobs + review
├── store/
│   ├── configStore.js   # Zustand: document types
│   └── jobStore.js      # Zustand: jobs, review queue
└── components/
    ├── Layout/
    │   └── AppHeader.jsx  # переключатель вкладок
    ├── Settings/
    │   ├── SettingsPage.jsx
    │   ├── DocumentTypeList.jsx
    │   ├── DocumentTypeForm.jsx  # создание/редактирование
    │   └── UploadSection.jsx     # загрузка PDF + кнопка запуска
    └── Review/
        └── (подзадача 9)
```

### 8.2 Settings Page

**UploadSection**:
- `Upload.Dragger` для загрузки одного или нескольких PDF
- Отображение очереди загруженных файлов (имя, размер, статус: pending/running/done/failed)
- Кнопка "Запустить обработку" — вызывает `POST /api/jobs/start-batch`
- Polling статуса задач каждые 3 секунды

**DocumentTypeList**:
- Таблица `ant Table` с колонками: Alias, Название, Паттерны (теги), Длина (min-max стр.), Действия
- Кнопки: Редактировать, Удалить
- Кнопка "Добавить тип документа" — открывает модальное окно с формой

**DocumentTypeForm** (Modal):
```
Поля:
- ID (alias): Input, обязательное, только [a-z_], disabled при редактировании
- Название: Input, обязательное
- Текстовые паттерны: Select mode="tags" (вводить Enter = добавить паттерн)
- Мин. страниц: InputNumber min=1
- Макс. страниц: InputNumber min=1
```

---

## ПОДЗАДАЧА 9 — Frontend: Review-экран

### 9.1 Список досье

```
ReviewPage
├── Статистика вверху: X требуют проверки, Y с частичными ошибками, Z корректных
├── Фильтры: Все | Ошибка | Частичная ошибка | Корректные
└── Список JobCard
```

**JobCard** — карточка одного досье:
- Заголовок с цветовой полосой:
  - 🔴 Красная — `status="needs_review"` И все страницы undetected/error
  - 🟠 Оранжевая — `status="needs_review"` И есть хоть одна ошибочная страница
  - 🟢 Зелёная — `status="done"` (скрыты в свёрнутом разделе "Корректные")
- Краткая информация: имя файла, кол-во страниц, кол-во распознанных документов
- Кнопка открыть исходный файл (GET `/api/jobs/{id}/source` → blob → window.open)
- `Collapse` / разворот карточки → показывает PageGrid

### 9.2 PageGrid — разворот досье

Горизонтальная полоса с миниатюрами страниц в порядке оригинала.  
Визуально сгруппированы по типу документа (тонкий разделитель между группами).

Каждая миниатюра `PageTile`:
```
┌─────────────┐
│  [превью]   │  ← клик → Modal с полноразмерным превью
│             │
│  Стр. N     │
│  [тип]      │  ← зелёный бейдж для OK, красный для ошибки
└─────────────┘
```

Превью: GET `/api/jobs/{id}/page/{num}/preview` (lazy loading, IntersectionObserver)

Над группой страниц одного типа: заголовок с типом документа.  
Над ошибочными страницами: код ошибки (`invalid_length` / `undetected`).

### 9.3 Ручное переназначение

**Выбор страниц**: `PageTile` поддерживает выбор через checkbox (появляется при hover).  
После выбора нескольких страниц → появляется floating toolbar:
```
[Выбрано: N страниц]  [Выпадающий список типов документов ▼]  [Применить]  [Отмена]
```

При нажатии "Применить" → `PATCH /api/review/jobs/{id}/pages`

После финального распределения всех ошибок → кнопка "Подтвердить и склеить" → `POST /api/review/jobs/{id}/confirm`

### 9.4 Просмотр страницы (Modal)

```
┌──────────────────────────────────┐
│  Досье: filename.pdf  Стр. 7/10  │
│  ◄ Предыдущая    Следующая ►     │
├──────────────────────────────────┤
│                                  │
│         [Изображение]            │
│                                  │
├──────────────────────────────────┤
│  Тип: Паспорт                    │
│  Метод: fusion  Conf: 0.92       │
│  [Изменить тип ▼]                │
└──────────────────────────────────┘
```

---

## ПОДЗАДАЧА 10 — Интеграция, запуск и E2E-тест

### 10.1 CORS и dev-прокси

**FastAPI** (`main.py`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Vite** (`vite.config.js`):
```js
server: {
  proxy: {
    '/api': 'http://localhost:8000'
  }
}
```

### 10.2 `main.py` — старт приложения

```python
@asynccontextmanager
async def lifespan(app):
    # Создать директории INPUT_DIR, OUTPUT_DIR, TEMP_DIR
    # Инициализировать DB (create_all)
    # Инициализировать модули: OCRModule, CVModule, VLMModule
    # Сохранить в app.state
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(router)
```

### 10.3 E2E-тест (ручной чеклист)

1. Запустить `uvicorn backend.main:app --reload`
2. Запустить `npm run dev` в `frontend/`
3. Открыть `http://localhost:5173`
4. Создать 2-3 типа документов с паттернами
5. Загрузить тестовый PDF (10 стр с 3 документами внутри)
6. Нажать "Запустить обработку"
7. Дождаться завершения (polling обновляет статус)
8. Перейти на Review-экран
9. Проверить отображение карточки досье
10. Развернуть карточку, проверить PageGrid
11. Перейти в OUTPUT_DIR — убедиться что PDF файлы созданы с правильными именами

### 10.4 `docker-compose.yml` (опционально, но рекомендуется)

```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    volumes:
      - ./data:/app/data
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
  
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
  
  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

---

## ЗАВИСИМОСТИ МЕЖДУ ПОДЗАДАЧАМИ

```
Подзадача 1 (Инфраструктура)
    └── Подзадача 2 (API)
            └── Подзадача 3 (PDF-сервис)
                    ├── Подзадача 4 (Text Layer)
                    ├── Подзадача 5 (FUSION/OCR+CV)
                    └── Подзадача 6 (VLM)
                            └── Подзадача 7 (Оркестратор)
                                    └── Подзадача 8 (Frontend Settings)
                                            └── Подзадача 9 (Frontend Review)
                                                    └── Подзадача 10 (Интеграция)
```

**Рекомендуемый порядок**: строго сверху вниз. Каждая подзадача должна проходить базовую проверку (тест или `curl`) перед переходом к следующей.

---

## КЛЮЧЕВЫЕ БИЗНЕС-ПРАВИЛА (не нарушать)

1. **Порядок эскалации**: text_layer → fusion → vlm → manual. Каждый следующий уровень применяется ТОЛЬКО для страниц/документов, которые предыдущий не смог корректно распознать.

2. **Проблемная длина**: если количество страниц между двумя титульниками не попадает в `[min_pages, max_pages]` — все страницы этого сегмента получают `error_code="invalid_length"` и идут на следующий уровень обработки.

3. **Нераспознанный начальный блок**: страницы ДО первого найденного титульника → `doc_type_id=None`, `error_code="undetected"`.

4. **VLM-контекст**: всегда передаются ровно 3 изображения. Граничные случаи (первая/последняя страница) → белая заглушка.

5. **Именование выходных файлов**: `{source_stem}_{type_id}[_{N}].pdf` где N — только если данный тип встречается >1 раза в досье.

6. **Склейка только после подтверждения**: если хоть одна страница в досье `needs_review` — досье не склеивается автоматически. Склейка происходит только после `POST /review/jobs/{id}/confirm`.

---

## ПОДЗАДАЧА 11 — Полные Pydantic-схемы API

**Файл**: `models/schemas.py`

Все схемы используют `pydantic.BaseModel`. Описаны полностью, чтобы агент не додумывал поля самостоятельно.

### Схемы конфигурации документов

```python
class DocumentTypeCreate(BaseModel):
    id: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', description="slug-идентификатор")
    name: str = Field(..., min_length=1, max_length=100)
    text_patterns: list[str] = Field(..., min_length=1)
    min_pages: int = Field(..., ge=1)
    max_pages: int = Field(..., ge=1)
    visual_hints: dict = Field(default_factory=dict)

    @model_validator(mode='after')
    def check_page_range(self):
        if self.max_pages < self.min_pages:
            raise ValueError("max_pages должен быть >= min_pages")
        return self

class DocumentTypeUpdate(BaseModel):
    # id нельзя менять — его нет в Update-схеме
    name: str | None = None
    text_patterns: list[str] | None = None
    min_pages: int | None = Field(None, ge=1)
    max_pages: int | None = Field(None, ge=1)
    visual_hints: dict | None = None

class DocumentTypeResponse(BaseModel):
    id: str
    name: str
    text_patterns: list[str]
    min_pages: int
    max_pages: int
    visual_hints: dict
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### Схемы задач

```python
class JobStatus(str, Enum):
    pending    = "pending"
    running    = "running"
    done       = "done"
    failed     = "failed"
    needs_review = "needs_review"

class DetectionMethod(str, Enum):
    text_layer = "text_layer"
    fusion     = "fusion"
    vlm        = "vlm"
    manual     = "manual"

class JobUploadResponse(BaseModel):
    job_id: str
    filename: str
    status: JobStatus
    created_at: datetime

class JobListResponse(BaseModel):
    items: list[JobSummary]
    total: int

class JobSummary(BaseModel):
    job_id: str
    source_filename: str
    status: JobStatus
    total_pages: int | None        # None пока не начата обработка
    error_pages: int | None
    created_at: datetime
    finished_at: datetime | None
    model_config = ConfigDict(from_attributes=True)

class JobDetailResponse(BaseModel):
    job_id: str
    source_filename: str
    source_path: str
    status: JobStatus
    created_at: datetime
    finished_at: datetime | None
    error: str | None
    output_documents: list[OutputDocumentResponse]
    model_config = ConfigDict(from_attributes=True)
```

### Схемы страниц и документов

```python
class PageResultResponse(BaseModel):
    page_number: int              # 0-indexed
    document_type_id: str | None
    document_type_name: str | None  # JOIN с DocumentType для удобства фронта
    detection_method: DetectionMethod | None
    confidence: float | None
    error_code: str | None        # "invalid_length" | "undetected" | None
    is_title_page: bool
    manual_override: bool
    model_config = ConfigDict(from_attributes=True)

class OutputDocumentStatus(str, Enum):
    ok           = "ok"
    needs_review = "needs_review"
    error        = "error"

class OutputDocumentResponse(BaseModel):
    id: int
    document_type_id: str
    document_type_name: str | None
    occurrence_index: int
    start_page: int
    end_page: int
    page_count: int               # end_page - start_page + 1
    output_path: str | None
    output_filename: str | None   # только имя файла без пути
    status: OutputDocumentStatus
    model_config = ConfigDict(from_attributes=True)
```

### Схемы ревью

```python
class PageAssignmentItem(BaseModel):
    page_number: int
    document_type_id: str | None  # None = пометить как undetected вручную

class ReviewPatchRequest(BaseModel):
    assignments: list[PageAssignmentItem] = Field(..., min_length=1)

class ReviewConfirmResponse(BaseModel):
    job_id: str
    output_documents: list[OutputDocumentResponse]
    status: JobStatus

class ReviewJobsResponse(BaseModel):
    needs_review: list[JobSummary]   # status=needs_review
    done: list[JobSummary]           # status=done
    failed: list[JobSummary]         # status=failed
    stats: ReviewStats

class ReviewStats(BaseModel):
    total_jobs: int
    needs_review_count: int
    done_count: int
    failed_count: int
    total_pages_processed: int
    total_error_pages: int
```

---

## ПОДЗАДАЧА 12 — Детали реализации CV-модуля и DocLayoutYOLO

**Файл**: `modules/cv_module.py`

### Установка DocLayoutYOLO

```bash
pip install doclayout-yolo
# Модель скачивается автоматически при первом использовании
# или вручную:
# from huggingface_hub import hf_hub_download
# model_path = hf_hub_download("juliozhao/DocLayout-YOLO-DocStructBench", "doclayout_yolo_docstructbench_imgsz1024.pt")
```

### Полная реализация `CVModule`

```python
from doclayout_yolo import YOLOv10
import numpy as np
from dataclasses import dataclass, field

@dataclass
class LayoutBlock:
    label: str          # "title", "text", "figure", "table", "list", etc.
    bbox: list[float]   # [x1, y1, x2, y2] нормализованные 0..1
    confidence: float

@dataclass
class VisualPatterns:
    has_stamp: bool = False
    has_signature: bool = False
    has_photo_top_right: bool = False
    has_title_block: bool = False
    is_likely_title_page: bool = False
    is_likely_last_page: bool = False
    title_texts: list[str] = field(default_factory=list)
    raw_blocks: list[LayoutBlock] = field(default_factory=list)

class CVModule:
    STAMP_LABELS = {"figure"}       # DocLayoutYOLO не различает печати отдельно
    TITLE_LABELS = {"title", "section_header"}
    TEXT_LABELS  = {"text", "plain text"}
    
    # Зоны страницы (нормализованные координаты 0..1)
    BOTTOM_ZONE_Y = 0.65   # нижние 35% — зона печатей и подписей
    TOP_RIGHT_X   = 0.55   # правые 45%
    TOP_ZONE_Y    = 0.35   # верхние 35% — зона заголовков

    def __init__(self, model_path: str | None = None):
        self.model = YOLOv10(model_path or "doclayout_yolo_docstructbench_imgsz1024.pt")

    def detect_layout(self, image: np.ndarray) -> list[LayoutBlock]:
        """
        image: RGB numpy array (H, W, 3)
        Запускает inference, нормализует bbox к [0..1].
        imgsz=1024 — рекомендованный размер для DocLayoutYOLO.
        conf=0.25 — порог confidence.
        """
        results = self.model.predict(
            image,
            imgsz=1024,
            conf=0.25,
            device="cpu",   # или "cuda" если доступно
            verbose=False
        )
        blocks = []
        h, w = image.shape[:2]
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                label = result.names[int(box.cls[0])]
                blocks.append(LayoutBlock(
                    label=label.lower(),
                    bbox=[x1/w, y1/h, x2/w, y2/h],
                    confidence=float(box.conf[0])
                ))
        return blocks

    def detect_visual_patterns(self, image: np.ndarray) -> VisualPatterns:
        blocks = self.detect_layout(image)
        patterns = VisualPatterns(raw_blocks=blocks)

        for block in blocks:
            x1, y1, x2, y2 = block.bbox
            cx, cy = (x1+x2)/2, (y1+y2)/2  # центр блока

            # Печать или подпись: фигура в нижней зоне страницы
            if block.label in self.STAMP_LABELS and cy > self.BOTTOM_ZONE_Y:
                block_h = y2 - y1
                block_w = x2 - x1
                aspect = block_w / block_h if block_h > 0 else 0
                # Печать ≈ квадратная фигура; подпись ≈ широкая и низкая
                if 0.7 < aspect < 1.4:
                    patterns.has_stamp = True
                else:
                    patterns.has_signature = True

            # Фото в правом верхнем углу (паспорт)
            if block.label in self.STAMP_LABELS:
                if cx > self.TOP_RIGHT_X and cy < self.TOP_ZONE_Y:
                    block_h = y2 - y1
                    block_w = x2 - x1
                    # Фото занимает заметную площадь
                    if block_h > 0.05 and block_w > 0.05:
                        patterns.has_photo_top_right = True

            # Заголовок в верхней зоне
            if block.label in self.TITLE_LABELS and cy < self.TOP_ZONE_Y:
                patterns.has_title_block = True

        # Агрегированные выводы
        patterns.is_likely_last_page = patterns.has_stamp or patterns.has_signature
        patterns.is_likely_title_page = patterns.has_title_block

        return patterns
```

### Fusion: логика объединения OCR и CV

```python
# modules/fusion.py

@dataclass
class FusionResult:
    doc_type_id: str | None
    confidence: float
    method: str = "fusion"
    error_code: str | None = None
    ocr_match: PatternMatch | None = None
    visual_patterns: VisualPatterns | None = None

def combine_ocr_and_cv(
    ocr_best_match: PatternMatch | None,   # лучшее совпадение из OCR
    visual: VisualPatterns,
    document_types: list[DocumentType],
    ocr_threshold: float
) -> FusionResult:
    """
    Матрица решений:

    OCR найден + CV подтверждает  → confidence = ocr_score * 1.1, capped at 1.0
    OCR найден + CV нейтрален     → confidence = ocr_score
    OCR найден + CV противоречит  → confidence = ocr_score * 0.8
    OCR не найден + CV title_page → confidence = 0.60, type = None (нужна эскалация)
    OCR не найден + CV last_page  → confidence = 0.50, error_code = "end_of_doc_hint"
    Ничего                        → confidence = 0.0, type = None
    """
    if ocr_best_match and ocr_best_match.score >= ocr_threshold:
        base_conf = ocr_best_match.score
        if visual.is_likely_title_page:
            conf = min(base_conf * 1.1, 1.0)
        elif visual.is_likely_last_page:
            conf = base_conf * 0.8   # странно — и заголовок и конец?
        else:
            conf = base_conf
        return FusionResult(
            doc_type_id=ocr_best_match.doc_type_id,
            confidence=conf,
            ocr_match=ocr_best_match,
            visual_patterns=visual
        )
    elif visual.is_likely_title_page:
        return FusionResult(doc_type_id=None, confidence=0.60, visual_patterns=visual)
    elif visual.is_likely_last_page:
        return FusionResult(
            doc_type_id=None, confidence=0.50,
            error_code="end_of_doc_hint", visual_patterns=visual
        )
    else:
        return FusionResult(doc_type_id=None, confidence=0.0, visual_patterns=visual)
```

---

## ПОДЗАДАЧА 13 — Детали оркестратора: полный алгоритм пошагово

Это расширение подзадачи 7 с конкретными алгоритмическими деталями.

### 13.1 Гранулярность обработки: уровень «документа», не «страницы»

Эскалация применяется на уровне **сегмента** (группы последовательных страниц), а не отдельной страницы:

```
Сегмент = {start_page, end_page, assigned_type, error_code}

Text Layer даёт черновые сегменты.
Если у сегмента error_code → весь сегмент идёт на FUSION.
FUSION обрабатывает каждую страницу сегмента отдельно, потом пересобирает сегменты.
Если новые сегменты после FUSION всё ещё содержат ошибки → VLM.
VLM обрабатывает страницы побочно с минимальным confidence → если < threshold, manual.
```

### 13.2 Псевдокод `_process_pipeline`

```python
async def _process_pipeline(self, job):
    pdf_path = job.source_path
    doc_types = await self.db.get_all_document_types()

    # ── ШАГ 1: Text Layer ──────────────────────────────────────────────
    pages_text = pdf_service.extract_text_layer(pdf_path)
    total_pages = len(pages_text)

    # Страницы с текстовым слоем
    text_pages = [p for p in pages_text if p["has_text_layer"]]
    scan_pages = [p for p in pages_text if not p["has_text_layer"]]

    tl_assignments = {}  # page_num → PageAssignment

    if text_pages:
        title_matches = text_layer.find_title_pages_by_text(text_pages, doc_types)
        tl_result = text_layer.assign_pages_from_title_pages(
            title_matches, total_pages, doc_types
        )
        for a in tl_result:
            tl_assignments[a.page_number] = a

    # ── ШАГ 2: Определяем, какие страницы нужна FUSION ─────────────────
    need_fusion = set()
    for page_num in range(total_pages):
        if page_num in [p["page"] for p in scan_pages]:
            need_fusion.add(page_num)  # отсканированные — сразу на FUSION
        elif page_num in tl_assignments:
            a = tl_assignments[page_num]
            if a.error_code:            # ошибка text_layer → FUSION
                need_fusion.add(page_num)
        else:
            need_fusion.add(page_num)   # нет результата → FUSION

    # ── ШАГ 3: FUSION ──────────────────────────────────────────────────
    fusion_assignments = {}
    if need_fusion:
        for page_num in sorted(need_fusion):
            raw_img = pdf_service.render_page_to_image(pdf_path, page_num, settings.PDF_RENDER_DPI)
            ocr_img = pdf_service.enhance_for_ocr(raw_img)
            cv_img  = pdf_service.enhance_for_cv(raw_img)

            ocr_text    = ocr_module.extract_text(ocr_img)
            ocr_matches = ocr_module.match_patterns(ocr_text, doc_types, settings.OCR_MATCH_THRESHOLD)
            best_ocr    = max(ocr_matches, key=lambda m: m.score) if ocr_matches else None

            visual = cv_module.detect_visual_patterns(cv_img)
            result = fusion.combine_ocr_and_cv(best_ocr, visual, doc_types, settings.OCR_MATCH_THRESHOLD)

            fusion_assignments[page_num] = PageAssignment(
                page_number=page_num,
                doc_type_id=result.doc_type_id,
                is_title_page=(best_ocr is not None and best_ocr.score >= settings.OCR_MATCH_THRESHOLD),
                error_code=result.error_code if not result.doc_type_id else None,
                detection_method="fusion",
                confidence=result.confidence
            )

    # ── ШАГ 4: Определяем, какие страницы идут на VLM ──────────────────
    need_vlm = set()
    for page_num, a in fusion_assignments.items():
        if a.doc_type_id is None or a.confidence < 0.65:
            need_vlm.add(page_num)

    # ── ШАГ 5: VLM ─────────────────────────────────────────────────────
    vlm_assignments = {}
    rendered_cache = {}  # кэш рендеринга страниц для VLM

    def get_img(n):
        if n not in rendered_cache:
            if 0 <= n < total_pages:
                rendered_cache[n] = pdf_service.render_page_to_image(pdf_path, n, settings.PDF_RENDER_DPI)
            else:
                rendered_cache[n] = None  # белая заглушка
        return rendered_cache[n]

    # Формируем контекст из уже обработанных страниц (по порядку)
    running_context = []  # последние 5 PageAssignment

    for page_num in sorted(need_vlm):
        vlm_result = await vlm_module.classify_page(
            prev_image=get_img(page_num - 1),
            target_image=get_img(page_num),
            next_image=get_img(page_num + 1),
            document_types=doc_types,
            recent_context=running_context[-5:]
        )
        assignment = PageAssignment(
            page_number=page_num,
            doc_type_id=vlm_result.type_id if vlm_result.confidence >= settings.VLM_CONFIDENCE_THRESHOLD else None,
            is_title_page=False,   # VLM не определяет титульник явно
            error_code=None if vlm_result.confidence >= settings.VLM_CONFIDENCE_THRESHOLD else "low_vlm_confidence",
            detection_method="vlm",
            confidence=vlm_result.confidence
        )
        vlm_assignments[page_num] = assignment
        running_context.append(assignment)

    # ── ШАГ 6: Финальное слияние всех назначений ───────────────────────
    final_assignments: list[PageAssignment] = []
    for page_num in range(total_pages):
        if page_num in vlm_assignments:
            final_assignments.append(vlm_assignments[page_num])
        elif page_num in fusion_assignments and page_num in need_fusion:
            final_assignments.append(fusion_assignments[page_num])
        elif page_num in tl_assignments:
            final_assignments.append(tl_assignments[page_num])
        else:
            # Страница вообще без результата — не должно случаться
            final_assignments.append(PageAssignment(
                page_number=page_num,
                doc_type_id=None,
                is_title_page=False,
                error_code="undetected",
                detection_method="text_layer",
                confidence=0.0
            ))

    # ── ШАГ 7: Пересчёт invalid_length после финального слияния ────────
    # (title_pages могли добавиться из FUSION/VLM — пересматриваем сегменты)
    final_assignments = self._revalidate_lengths(final_assignments, doc_types)

    # ── ШАГ 8: Сохранение в БД ─────────────────────────────────────────
    await self._save_page_results(job.id, final_assignments)

    # ── ШАГ 9: Построение OutputDocument ───────────────────────────────
    output_docs = self._assign_document_boundaries(final_assignments, doc_types)
    await self._save_output_documents(job.id, output_docs)

    # ── ШАГ 10: Склейка PDF для OK-документов ──────────────────────────
    ok_docs = [d for d in output_docs if d.status == "ok"]
    await self._assemble_pdfs(job, ok_docs)

    # ── ШАГ 11: Статус задачи ──────────────────────────────────────────
    has_problems = any(d.status != "ok" for d in output_docs)
    job.status = "needs_review" if has_problems else "done"
    job.finished_at = datetime.utcnow()
    await self.db.save(job)
```

### 13.3 `_revalidate_lengths`

```python
def _revalidate_lengths(
    self,
    assignments: list[PageAssignment],
    doc_types: dict[str, DocumentType]
) -> list[PageAssignment]:
    """
    После слияния всех методов пересчитывает длины сегментов.
    Сегмент = непрерывная последовательность страниц с одним doc_type_id.
    Если длина сегмента не в [min_pages, max_pages] → всем страницам сегмента
    ставим error_code="invalid_length" (кроме undetected, у них своя ошибка).
    """
    # Группируем по сегментам
    segments = []
    current_type = None
    current_segment = []
    for a in sorted(assignments, key=lambda x: x.page_number):
        if a.doc_type_id != current_type:
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
            if not (dt.min_pages <= length <= dt.max_pages):
                for a in seg:
                    a.error_code = "invalid_length"
        result.extend(seg)
    return result
```

---

## ПОДЗАДАЧА 14 — Обработка ошибок и edge-cases

### 14.1 HTTP-ошибки (FastAPI exception handlers)

```python
# main.py
@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=422, content={"detail": str(exc)})

@app.exception_handler(FileNotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": "Файл не найден"})
```

Все эндпоинты должны возвращать единообразный формат ошибки:
```json
{
  "detail": "Человекочитаемое сообщение",
  "code": "MACHINE_READABLE_CODE"   // опционально
}
```

### 14.2 Edge-cases оркестратора

| Ситуация | Поведение |
|----------|-----------|
| PDF пустой (0 страниц) | job.status = "failed", error = "empty_pdf" |
| PDF повреждён (fitz.open бросает исключение) | job.status = "failed", error = "corrupted_pdf" |
| Ollama недоступен | VLM возвращает confidence=0.0 для всех страниц, страницы → manual |
| DocLayoutYOLO не загружается | CV-модуль выбрасывает RuntimeError при init, логируется, fusion работает только через OCR |
| PaddleOCR не загружается | OCR-модуль выбрасывает RuntimeError, fusion работает только через CV |
| Все страницы undetected | job.status = "needs_review", все страницы в ручное распределение |
| Один тип встречается несколько раз подряд | occurrence_index = 1, 2, 3... для каждого отдельного сегмента |
| Загружен не PDF | FastAPI: HTTP 422, "Допустимы только PDF-файлы" |
| Задача уже running | HTTP 409, "Задача уже обрабатывается" |

### 14.3 Логирование

Использовать стандартный `logging` Python с уровнями:

```python
# config.py
LOGGING_LEVEL: str = "INFO"

# Формат: [2024-01-15 10:23:45] INFO     orchestrator: Job abc123 — text_layer found 3 title pages
# Каждый модуль создаёт свой logger: logging.getLogger(__name__)
```

Обязательно логировать:
- Старт/конец обработки каждого job с job_id
- Какой метод применён к каждой странице (text_layer / fusion / vlm)
- Результат каждого метода (тип, confidence)
- Ошибки с traceback (уровень ERROR)

### 14.4 Превью страниц: кэширование

```python
# services/file_service.py

def get_page_preview_path(job_id: str, page_num: int) -> str:
    return f"{settings.TEMP_DIR}/{job_id}/previews/page_{page_num:04d}.jpg"

def render_and_cache_preview(
    pdf_path: str, job_id: str, page_num: int, dpi: int = 100
) -> str:
    """
    Рендерит страницу в JPEG 100 DPI (достаточно для превью),
    сохраняет в TEMP_DIR/{job_id}/previews/,
    возвращает путь.
    Если файл уже существует — возвращает путь без перерендеринга.
    """
```

Эндпоинт `GET /api/jobs/{job_id}/page/{page_num}/preview` использует `FileResponse` с `media_type="image/jpeg"`.

---

## ПОДЗАДАЧА 15 — Тестирование

### 15.1 Структура тестов

```
backend/tests/
├── conftest.py                  # фикстуры: тестовая БД, клиент, моки модулей
├── unit/
│   ├── test_text_layer.py       # юнит-тесты логики разбиения по паттернам
│   ├── test_fusion.py           # тесты матрицы combine_ocr_and_cv
│   ├── test_orchestrator.py     # тесты _revalidate_lengths, _assign_document_boundaries
│   └── test_pdf_service.py      # тесты split_pdf, build_output_filename
└── integration/
    ├── test_config_api.py        # CRUD документ-типов
    ├── test_job_api.py           # загрузка, запуск, статус
    └── test_review_api.py        # ревью, патч, подтверждение
```

### 15.2 Обязательные юнит-тесты для `text_layer.py`

```python
# tests/unit/test_text_layer.py

def test_first_page_not_title():
    """Страницы до первого титульника → undetected"""
    pages = [
        {"page": 0, "text": "какой-то текст", "has_text_layer": True},
        {"page": 1, "text": "КРЕДИТНЫЙ ДОГОВОР №123", "has_text_layer": True},
        {"page": 2, "text": "текст договора", "has_text_layer": True},
    ]
    doc_types = [DocumentType(id="credit", text_patterns=["кредитный договор"], min_pages=1, max_pages=5)]
    result = assign_pages_from_title_pages(
        find_title_pages_by_text(pages, doc_types), 3, {"credit": doc_types[0]}
    )
    assert result[0].doc_type_id is None
    assert result[0].error_code == "undetected"
    assert result[1].doc_type_id == "credit"
    assert result[1].is_title_page is True
    assert result[2].doc_type_id == "credit"

def test_invalid_length_marked():
    """Документ с 5 страницами при max_pages=3 → invalid_length"""
    ...

def test_multiple_same_type():
    """Два документа одного типа подряд → два отдельных сегмента"""
    ...

def test_unknown_pages_between_docs():
    """Нераспознанные страницы между двумя документами → undetected сегмент"""
    ...
```

### 15.3 Обязательные юнит-тесты для `fusion.py`

```python
def test_ocr_match_with_cv_confirmation():
    """OCR нашёл тип + CV подтверждает → confidence > ocr_score"""
    ocr_match = PatternMatch(doc_type_id="passport", score=0.90)
    visual = VisualPatterns(has_photo_top_right=True, is_likely_title_page=True)
    result = combine_ocr_and_cv(ocr_match, visual, [], 0.87)
    assert result.doc_type_id == "passport"
    assert result.confidence >= 0.90

def test_no_ocr_no_cv():
    """Ничего не найдено → undetected"""
    result = combine_ocr_and_cv(None, VisualPatterns(), [], 0.87)
    assert result.doc_type_id is None
    assert result.confidence == 0.0

def test_ocr_below_threshold():
    """OCR ниже порога → не засчитывается"""
    ocr_match = PatternMatch(doc_type_id="passport", score=0.70)
    result = combine_ocr_and_cv(ocr_match, VisualPatterns(), [], 0.87)
    assert result.doc_type_id is None
```

### 15.4 `conftest.py` с моками ML-модулей

```python
# tests/conftest.py
import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    yield Session()

@pytest.fixture
def mock_ocr_module():
    m = MagicMock()
    m.extract_text.return_value = ""
    m.match_patterns.return_value = []
    return m

@pytest.fixture
def mock_cv_module():
    m = MagicMock()
    m.detect_visual_patterns.return_value = VisualPatterns()
    return m

@pytest.fixture
def mock_vlm_module():
    m = MagicMock()
    m.classify_page = AsyncMock(return_value=VLMResult(type_id="undetected", confidence=0.0))
    return m

@pytest.fixture
def client(test_db, mock_ocr_module, mock_cv_module, mock_vlm_module):
    app.state.db = test_db
    app.state.ocr = mock_ocr_module
    app.state.cv = mock_cv_module
    app.state.vlm = mock_vlm_module
    return TestClient(app)
```

### 15.5 Запуск тестов

```bash
cd backend
pytest tests/ -v --tb=short
pytest tests/unit/ -v         # только юниты (быстро, без моделей)
pytest tests/integration/ -v  # только интеграция
```

---

## ПОДЗАДАЧА 16 — Frontend: детали компонентов и стейт-менеджмент

### 16.1 Zustand-сторы

```javascript
// store/configStore.js
import { create } from 'zustand'
import { getDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType } from '../api/configApi'

export const useConfigStore = create((set, get) => ({
  documentTypes: [],
  loading: false,
  error: null,

  fetchDocumentTypes: async () => {
    set({ loading: true, error: null })
    try {
      const data = await getDocumentTypes()
      set({ documentTypes: data, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  createDocumentType: async (payload) => {
    const data = await createDocumentType(payload)
    set(s => ({ documentTypes: [...s.documentTypes, data] }))
    return data
  },

  updateDocumentType: async (id, payload) => {
    const data = await updateDocumentType(id, payload)
    set(s => ({
      documentTypes: s.documentTypes.map(dt => dt.id === id ? data : dt)
    }))
    return data
  },

  deleteDocumentType: async (id) => {
    await deleteDocumentType(id)
    set(s => ({ documentTypes: s.documentTypes.filter(dt => dt.id !== id) }))
  }
}))
```

```javascript
// store/jobStore.js
export const useJobStore = create((set, get) => ({
  jobs: [],           // все задачи
  pollingActive: false,
  selectedPages: {},  // { [jobId]: Set<pageNumber> }

  uploadFile: async (file) => { ... },
  startBatch: async () => { ... },
  fetchJobs: async () => { ... },

  // Polling: обновляет только running/pending задачи
  startPolling: () => {
    const interval = setInterval(async () => {
      const { jobs } = get()
      const activeJobs = jobs.filter(j => ['pending', 'running'].includes(j.status))
      if (activeJobs.length === 0) return
      await get().fetchJobs()
    }, 3000)
    set({ pollingActive: true, _interval: interval })
  },

  stopPolling: () => {
    clearInterval(get()._interval)
    set({ pollingActive: false })
  },

  // Выбор страниц для bulk-переназначения
  togglePageSelection: (jobId, pageNum) => {
    set(s => {
      const current = new Set(s.selectedPages[jobId] || [])
      current.has(pageNum) ? current.delete(pageNum) : current.add(pageNum)
      return { selectedPages: { ...s.selectedPages, [jobId]: current } }
    })
  },

  clearSelection: (jobId) => {
    set(s => ({ selectedPages: { ...s.selectedPages, [jobId]: new Set() } }))
  },

  assignPages: async (jobId, assignments) => { ... },
  confirmJob: async (jobId) => { ... }
}))
```

### 16.2 API-клиент

```javascript
// api/client.js
import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

// Глобальная обработка ошибок
client.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.detail || err.message || 'Неизвестная ошибка'
    // Можно подключить antd message: message.error(msg)
    return Promise.reject(new Error(msg))
  }
)

export default client
```

### 16.3 Компонент `PageTile` — детальная спецификация

```jsx
// components/Review/PageTile.jsx
// Props:
// - jobId: string
// - page: PageResultResponse
// - isSelected: boolean
// - onToggleSelect: (pageNum) => void
// - onClickPreview: (pageNum) => void

const statusColor = {
  null: '#ff4d4f',            // undetected — красный
  'invalid_length': '#faad14', // оранжевый
  default: '#52c41a'           // зелёный
}

// Размер тайла: 120x160px
// Превью: <img> с lazy src, placeholder — серый прямоугольник (Skeleton)
// Checkbox: position absolute, top-left, opacity-0 при не-hover, opacity-1 при hover или isSelected
// Бейдж типа: внизу тайла, цвет по statusColor
// При isSelected: тайл обводится синей рамкой 2px
```

### 16.4 `FloatingAssignToolbar` — floating панель выбора

```jsx
// Рендерится через React Portal в body
// Появляется только если selectedPages[jobId].size > 0
// Позиция: fixed, bottom: 24px, left: 50%, transform: translateX(-50%)
// Содержит:
//   - "Выбрано: N стр."
//   - Select с опциями из documentTypes + опция "Нераспознан"
//   - Кнопка "Применить" (primary)
//   - Кнопка "Отмена" (default)
// При "Применить": вызывает jobStore.assignPages, затем clearSelection
```

---

## ПОДЗАДАЧА 17 — Конфигурация сборки и деплой

### 17.1 `frontend/package.json` (ключевые зависимости)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "antd": "^5.20.0",
    "@ant-design/icons": "^5.4.0",
    "axios": "^1.7.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

### 17.2 `frontend/vite.config.js`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
```

### 17.3 `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Системные зависимости для OpenCV и PaddleOCR
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxrender1 libxext6 \
    libgomp1 libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Создать директории данных
RUN mkdir -p /app/data/input /app/data/output /app/data/temp

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 17.4 `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 17.5 `nginx.conf` (для prod)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Проксирование API на бэкенд
    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Для стриминга PDF
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### 17.6 `.env.example`

```env
# Backend
INPUT_DIR=./data/input
OUTPUT_DIR=./data/output
TEMP_DIR=./data/temp
DATABASE_URL=sqlite:///./app.db

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3vl:8b

OCR_MATCH_THRESHOLD=0.87
VLM_CONFIDENCE_THRESHOLD=0.70
PDF_RENDER_DPI=200

LOGGING_LEVEL=INFO

# Frontend
VITE_API_BASE_URL=/api
```

---

## ИТОГОВЫЙ ЧЕКЛИСТ ПОДЗАДАЧ

| # | Подзадача | Ключевой файл/результат | Проверка |
|---|-----------|------------------------|----------|
| 1 | Инфраструктура, БД, конфиг | `main.py`, `db_models.py`, `config.py` | `uvicorn` стартует, `/docs` открывается |
| 2 | API: config + jobs + review | `*_routes.py` | `curl /api/config/document-types` → `[]` |
| 3 | PDF-сервис и рендеринг | `pdf_service.py` | Тест: extract_text_layer на тестовом PDF |
| 4 | Text Layer модуль | `modules/text_layer.py` | Юнит-тесты проходят |
| 5 | FUSION: OCR + CV | `ocr_module.py`, `cv_module.py`, `fusion.py` | Тест на одной отсканированной странице |
| 6 | VLM модуль | `vlm_module.py` | curl к Ollama возвращает JSON |
| 7 | Оркестратор | `core/orchestrator.py` | Обработка тестового PDF end-to-end |
| 8 | Frontend: Settings | `SettingsPage`, `DocumentTypeForm` | CRUD типов через UI |
| 9 | Frontend: Review | `ReviewPage`, `PageGrid`, `PageTile` | Визуализация результатов |
| 10 | Интеграция | CORS, прокси, E2E | Полный цикл от загрузки до скачивания |
| 11 | Pydantic-схемы | `models/schemas.py` | Все эндпоинты возвращают валидный JSON |
| 12 | CV детали | `cv_module.py` полная реализация | Тест на паспорте: `has_photo_top_right=True` |
| 13 | Оркестратор: алгоритм | Псевдокод реализован | Тест со смешанным PDF (текст+скан) |
| 14 | Ошибки и edge-cases | Exception handlers, логи | Загрузка битого PDF → 422 |
| 15 | Тесты | `tests/unit/`, `tests/integration/` | `pytest tests/unit/ -v` всё зелёное |
| 16 | Frontend стейт | Zustand сторы, polling | Статус задачи обновляется без перезагрузки |
| 17 | Деплой | `Dockerfile`, `docker-compose.yml` | `docker compose up` — всё запускается |
