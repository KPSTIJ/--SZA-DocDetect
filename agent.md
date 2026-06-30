# Agent

Ты — senior full-stack разработчик, работающий над системой автоматического разрезания PDF-досье.

Проект описан в `SPECIFICATION.md`. Читай его перед началом каждой подзадачи.

---

## Роль и приоритеты

Твоя задача — реализовывать подзадачи из спецификации точно и полностью, без отступлений от описанных интерфейсов, структур данных и алгоритмов.

**Главный приоритет проекта**: точность распознавания, а не скорость.

При любом конфликте между удобством реализации и точностью — выбирай точность.

---

## Стек

**Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, SQLite, Pydantic v2, pydantic-settings  
**ML/CV**: PaddleOCR (lang=ru), DocLayoutYOLO, Qwen3VL-8b через Ollama, rapidfuzz, OpenCV, PyMuPDF (fitz)  
**Frontend**: React 18, Ant Design 5, Vite, Zustand, Axios

---

## Структура проекта

```
project/
├── main.py                 # Точка входа (run/dev/test/e2e/pipeline/db-init/shell)
├── START.md                # Гайд по запуску и деплою
├── .env.example
├── docker-compose.yml / docker-compose.dev.yml / docker-compose.deploy.yml
├── Dockerfile.backend / Dockerfile.frontend
├── deploy/
│   ├── deploy.sh           # Скрипт деплоя на Ubuntu
│   ├── nginx.conf           # Nginx reverse proxy
│   └── pdf-splitter.service # systemd unit
├── backend/
│   ├── main.py
│   ├── config.py            # pydantic-settings, читает .env
│   ├── database.py
│   ├── requirements.txt / requirements.core.txt / requirements.ml.txt / requirements.prod.txt
│   ├── models/              # db_models.py + schemas.py
│   ├── api/                 # config_routes, job_routes, review_routes
│   ├── core/                # orchestrator.py
│   ├── modules/             # text_layer, ocr_module, cv_module, vlm_module, fusion
│   ├── services/            # pdf_service.py, file_service.py, smb_service.py
│   └── tests/               # unit-тесты (15 шт.)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf           # Production nginx conf для frontend
│   └── src/
│       ├── App.jsx + main.jsx
│       ├── api/             # client.js, configApi.js, jobsApi.js
│       ├── store/           # configStore.js, jobStore.js
│       └── components/
│           ├── PdfViewerPanel.jsx  # Просмотрщик исходного PDF
│           ├── DevConsole.jsx     # Dev-консоль (Shift+Alt+M)
│           ├── Settings/    # SettingsPage, DocumentTypeList, DocumentTypeForm, UploadSection, FolderBrowser
│           ├── Review/      # ReviewPage, DossierModal, PageTile, FloatingAssignToolbar
│           └── Layout/      # AppHeader, Icons
```

---

## Статус реализации (все 17 подзадач + дополнительные фичи)

### Что реализовано:

| # | Подзадача | Статус |
|---|-----------|--------|
| 1 | Инфраструктура, БД, конфиг | ✅ |
| 2 | API: config + jobs + review | ✅ |
| 3 | PDF-сервис и рендеринг | ✅ |
| 4 | Text Layer модуль | ✅ |
| 5 | FUSION (OCR + CV) | ✅ |
| 6 | VLM модуль | ✅ |
| 7 | Оркестратор пайплайна | ✅ |
| 8 | Frontend: Settings | ✅ |
| 9 | Frontend: Review | ✅ |
| 10 | Интеграция (CORS, прокси, BackgroundTasks) | ✅ |
| 11 | Pydantic-схемы API | ✅ |
| 12 | CV детали (DocLayoutYOLO) | ✅ |
| 13 | Оркестратор: полный алгоритм | ✅ |
| 14 | Обработка ошибок и edge-cases | ✅ |
| 15 | Unit-тесты (15 шт.) | ✅ |
| 16 | Frontend: стейт, PageTile, Toolbar, глобальный прогрессбар | ✅ |
| 17 | Деплой: Docker, nginx, systemd, deploy.sh | ✅ |

### Дополнительно сделано:

- **Система проектов** — `Project` модель БД, CRUD API, ProjectBar в UI
- **Scope по проекту** — DocumentType и ProcessingJob привязаны к проекту через `project_id`
- **Alembic миграции** — единая миграция всех таблиц, авто-применение при старте (`alembic upgrade head` в lifespan)
- **batch_id** — группировка загрузок (пачка PDF → один batch_id)
- **DELETE /api/jobs/{id}** — удаление загрузки с очисткой файлов на диске
- **Non-blocking оркестратор** — синхронные ML-операции (OCR, CV, fitz) вынесены в `asyncio.to_thread()`
- **TextLayer на всех страницах** — титульники ищутся даже на страницах с коротким текстом (<50 символов)
- **invalid_length не теряет тип** — страницы с невалидной длиной сегмента сохраняют свой тип от TextLayer
- **Фильтры на странице «Разбор»** — по проекту, по загрузке (batch), поиск по имени файла
- **ProgressBar** — 5 сегментов (pending/running/done/needs_review/failed)
- **selectedProjectId в localStorage** — сохраняется между перезагрузками страницы
- **Кнопка удаления загрузки** — на каждой карточке досье
- **Обработка ошибок API** — читаемые сообщения об ошибках (Pydantic validation → человеческий текст)
- `python main.py db-migrate` — ручное применение миграций
- `python main.py dev` — одновременный запуск бэкенда + фронтенда
- `.env` с настройками Ollama (http://192.168.51.247:11434)
- Визуальный редизайн UI, перевод на русский
- Inline JSON-парсинг в VLM-модуле

- **PdfViewerPanel — просмотрщик исходного PDF**

- Фиксированная панель справа, ширина по пропорциям A4: `(100vh − 100px) × 210 / 297 + 40px`
- Одна страница за раз, `objectFit: contain`, `maxHeight: 100%`
- Навигация: стрелки клавиатуры ←/→ и скролл колёсиком по изображению
- Кнопки: «Скачать PDF», «Закрыть»
- При открытии основной интерфейс сдвигается влево через `body.paddingRight`
- Модальные окна (Ant Design Modal) сдвигаются через `body[data-panel-open] .ant-modal-wrap`
- `z-index: 1100` — поверх стандартных модалок

### Исправленные баги:

| Баг | Фикс |
|-----|------|
| PaddleOCR `ConvertPirAttribute2RuntimeAttribute` на CPU | `FLAGS_use_mkldnn=0` + `paddlepaddle==3.0.0` + `paddleocr==3.6.0` |
| VLM `NameError: name 'logger' not defined` | Добавлен `import logging` + `logger` |
| VLM возвращал пустой ответ от Ollama | Resize изображений до max 1024px |
| `GET /api/jobs/{id}` — 500 `'OutputDocument' object has no attribute 'doc'` | `d.doc.document_type_id` → `d.document_type_id` |
| `ReferenceError: Cannot access 'pdfViewer' before initialization` | Перенос `const pdfViewer` выше `useEffect` (Temporal Dead Zone) |
| `stats is not defined` в ReviewPage | Замена `stats.*` на `countByFilter.*` и `allJobs.length` |
| Кнопка «Запустить» висела при ошибке | `try/finally` в `uploadFiles`/`startBatch` |
| React crash при Pydantic-ошибке | `getErrMsg()` — извлекает текст из любого формата |
| 422 при загрузке `batch_id` | UUID генерация с полифиллом для старых браузеров |
| Акцепт приклеивался к КД | TextLayer теперь ищет паттерны на всех страницах, включая короткий текст |
| `invalid_length` стирал тип | Страницы с `invalid_length` сохраняют тип от TextLayer (не идут в Fusion) |
| ML-операции блокировали event loop | Синхронные вызовы обёрнуты в `asyncio.to_thread()` |
| **DELETE /api/jobs/batch/{id} — 404** | Добавлен эндпоинт `DELETE /jobs/batch/{batch_id}` |
| **Все pending задачи стартовали как running** | `start-batch` запускает только первый job, остальные чейнятся через оркестратор |
| **Статус досье считался по страницам, а не по документам** | `getJobColor` использует `job.status`, который выставляется по выходным документам |
| **`_save_final_output` (SMB) перезаписывал статус на `failed`** | Обёрнут в `try/except` |
| **Чейнинг перезаписывал статусы уже обработанных досье** | Добавлена проверка `status == 'pending'` |
| **`invalid_length` не вызывал `needs_review`** | `has_page_errors` проверяется ДО `_assign_document_boundaries`, `invalid_length` включён в `error_pages` |
| **Одинаковые типы подряд не разделялись** | `_assign_document_boundaries` автоматически разбивает по `max_pages` |
| **Кавычки в паттернах не совпадали с текстом PDF** | `_normalize_quotes()` в text_layer — заменяет все виды кавычек на стандартные `"` |
| **`name 'Project' is not defined` в `_save_final_output`** | Добавлен импорт `Project` |
| **`name 'Path' is not defined` в `_save_to_local`** | Добавлен импорт `pathlib.Path` |

### Доработки Frontend:

- **ProjectBar** — выбор/создание проекта, интеграция с SettingsPage
- **Фильтры «Разбор»** — проект / загрузка (batch) / поиск по файлу
- **Прогрессбар** — 5 цветных сегментов: pending (серый), running (синий), done (зелёный), review (оранж), failed (красный)
- **PdfViewerPanel** — просмотрщик неразрезанного PDF в правой панели с A4-пропорциями, навигацией и скачиванием
- **DossierModal** — тип документа сверху превью, разделители между группами типов, увеличен `marginBottom` и `padding`
- **PageTile**: зелёная рамка + glow 6px при выборе, 150×200px, иконка-документ с pulse-анимацией
- **UploadSection**: русские статусы, блокировка без проекта, ошибки через `getErrMsg()`
- **DocumentTypeList**: кнопка «Добавить» в шапке, проект в Select
- **AppHeader**: кастомные кнопки вместо Tabs, одинаковые отступы
- **Скроллбар**: кастомный `::-webkit-scrollbar` для тёмной (#5a5e66) и светлой (#d0d0d0) темы
- **Select/Input**: цвета в тёмной теме
- **Тёмная тема**: корректное отображение всех элементов, CSS-переменные
- **SMB интеграция** — `smb_service.py`, `smb_routes.py`: чтение/создание папок, сохранение файлов на SMB-шару через smbprotocol
- **Браузер папок SMB** — `FolderBrowser.jsx`: модальное окно с навигацией по папкам, breadcrumbs, создание папок
- **Выбор финальной директории** — кнопка «Выбрать папку для выгрузки» → модалка-браузер. Корень `cv_results`, нельзя подняться выше
- **Dev-консоль** — `DevConsole.jsx` + `log_routes.py`: лог-панель по `Shift+Alt+M`. Правая панель 500px, файловый логгер, автообновление 2с
- **Распределение статусов** — RED: `error_pages === total_pages` («Не распознано»), ORANGE: `error_pages > 0` («Частичные ошибки»). `invalid_length` не считается ошибкой
- **Группировка типов по смежности** — одинаковые типы в несмежных сегментах показываются отдельно с нумерацией
- **VLM таймаут** — 60с (было 120с)
- **Загрузка без автостарта** — обработка только по «Запустить обработку», не сразу после загрузки
- **Вкладка «В обработке»** — фильтр для running/pending досье справа от остальных вкладок
- **Единый источник истины для статусов** — `job.status` выставляется бэкендом по выходным документам, фронтенд только читает
- **Авто-сплит одинаковых типов подряд** — `_assign_document_boundaries` разбивает сегменты, превышающие `max_pages`, на несколько документов
- **Нормализация кавычек в text_layer** — `_normalize_quotes()` приводит все виды кавычек к стандартному виду
- **Один job в обработке** — `start-batch` запускает только первый, остальные чейнятся последовательно
- **Чейнинг с проверкой статуса** — следующий job запускается только если `status == 'pending'`, уже обработанные не перезатираются
- **Лог-буфер через файл** — DevConsole читает `/tmp/uvicorn10.log`, а не in-memory буфер

---

## Развёртывание

### На Ubuntu (вручную, без sudo для Docker):

```bash
python3 -m venv venv
source venv/bin/activate
pip install paddlepaddle==3.0.0
pip install paddleocr==3.6.0
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements.prod.txt
pip install doclayout-yolo
cp .env.example .env
# настроить OLLAMA_BASE_URL, CORS_ORIGINS
cd frontend && npm install && npm run build && cd ..
export FLAGS_use_mkldnn=0
uvicorn backend.main:app --host 0.0.0.0 --port 18000
```

### Docker (требуются права на docker.sock):

```bash
docker compose -f docker-compose.deploy.yml up -d
```

### Запущенные сервисы:

| Сервис | URL |
|--------|-----|
| Frontend (UI) | http://192.168.51.6:5173 |
| Backend API | http://192.168.51.6:18000 |
| Swagger docs | http://192.168.51.6:18000/docs |

---

## Осталось сделать

### Нужно протестировать:
- Полный pipeline на Ubuntu с CUDA + GPU (PaddleOCR GPU, DocLayoutYOLO)
- VLM с реальными отсканированными документами (не сгенерированными PDF)
- Обработка битых PDF, пустых PDF, не-PDF файлов
- PdfViewerPanel с большими PDF (50+ страниц)
- Устойчивость при недоступном Ollama

### Известные проблемы:
- VLM ошибка `"this model does not support pdf input"` при классификации страниц через VLM (если модель не поддерживает изображения). **Проверено: модель `qwen3-vl:8b` работает корректно с base64 JPEG**
- DocumentType `id` (alias) — глобальный PK, а не составной `(project_id, id)`. Два проекта не могут иметь тип с одинаковым alias
- PaddleOCR не thread-safe — FUSION обрабатывает страницы последовательно (один экземпляр PaddleOCR на процесс)
- `SMB_ROOT` фиксирован в `.env`, нельзя изменить через UI
- SMB-сессия создаётся заново для каждого запроса (нет пула соединений)
- `STATUS_OBJECT_NAME_COLLISION` при сохранении на SMB, если файл уже существует — не фатально, ошибка логируется и игнорируется

### Улучшения:
- Интеграционные тесты (папка `tests/integration/` пуста)
- Юнит-тесты для `ocr_module`, `cv_module`, `vlm_module`, `file_service`

### Деплой на Ubuntu с GPU:
1. Установить CUDA 12.x + драйверы NVIDIA
2. `pip install paddlepaddle-gpu==3.0.0rc0`
3. Настроить `.env`
4. `sudo bash deploy/deploy.sh`

---

## Правила работы

### Перед написанием кода
- Перечитай соответствующий раздел спецификации
- Уточни подзадачу и её номер
- Если что-то не описано в спеке — спроси

### Backend-соглашения
- Async везде
- `get_db` — через `Depends`
- Миграции — только через Alembic
- Логирование — через стандартный `logging`

### Frontend-соглашения
- Состояние — через Zustand-сторы
- API-вызовы — только из `api/` модулей
- Polling 3 секунды в `jobStore`
- Тёмная тема — через CSS-переменные: `--bg-card`, `--border`, `--text`, `--accent` и т.д.

---

## Команды для проверки

```bash
python main.py test         # Unit-тесты (15 шт.)
python main.py e2e          # API-тесты (15 сценариев)
python main.py pipeline     # Тест пайплайна text_layer
```
