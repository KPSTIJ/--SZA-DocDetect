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

**Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, SQLite, Pydantic v2, pydantic-settings  
**ML/CV**: PaddleOCR (lang=ru), DocLayoutYOLO, Qwen3VL-8b через Ollama, rapidfuzz, OpenCV, PyMuPDF (fitz)  
**Frontend**: React 18, Ant Design 5, Vite, Zustand, Axios

---

## Структура проекта

```
project/
├── main.py                 # Точка входа (run/dev/test/e2e/pipeline/db-init/shell)
├── START.md                # Гайд по запуску и деплою
├── .env.example
├── docker-compose.yml
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
│   ├── services/            # pdf_service.py, file_service.py
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
│       └── components/      # Settings/, Review/, Layout/, Icons.jsx
```

---

## Статус реализации (все 17 подзадач из SPECIFICATION.md выполнены)

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
- `main.py` — глобальная точка входа (run/dev/test/e2e/pipeline/db-init/shell)
- `python main.py dev` — одновременный запуск бэкенда + фронтенда
- `.env` с настройками Ollama (http://192.168.51.247:11434)
- Визуальный редизайн UI под цвета логотипа (#1a6b4a), перевод на русский
- Inline JSON-парсинг в VLM-модуле (регекс-извлечение из ответа модели)
- Progress bar: общий для всех вкладок, полупрозрачный в idle

---

## Осталось сделать

### Критические баги:
- **PaddleOCR на Windows не работает** (ошибка oneDNN `ConvertPirAttribute2RuntimeAttribute`). На Ubuntu с CUDA 12.x должно работать через `paddlepaddle-gpu==3.0.0rc0`
- **PaddlePaddle 3.x** (новая версия PaddleOCR) требует `paddlex` и `modelscope`, которые тянут `torch`. На Windows `torch` иногда падает с `shm.dll` error
- **Решение:** PaddleOCR был понижен до 2.x, но PaddleOCR 2.10 несовместим с PaddlePaddle 3.x. Оптимальная комбинация: **PaddlePaddle 3.3.1 + PaddleOCR 3.6.0** на Ubuntu + CUDA

### Нужно протестировать:
- Полный pipeline на Ubuntu с CUDA + GPU (PaddleOCR GPU, DocLayoutYOLO)
- VLM с реальными отсканированными документами (не сгенерированными PDF)
- E2E-тест с загрузкой → обработкой → проверкой результата
- Обработка битых PDF, пустых PDF, не-PDF файлов

### Улучшения API:
- `POST /start-batch` при already running → 409 Conflict (сейчас будет 500)
- Валидация PDF при загрузке (сейчас `fitz.open` упадёт с исключением)

### Деплой на Ubuntu:
1. Установить Python 3.11, Node.js, nginx, git
2. Установить CUDA 12.x + драйверы NVIDIA для RTX 5080
3. `pip install paddlepaddle-gpu==3.0.0rc0 -f https://www.paddlepaddle.org.cn/whl/linux/cuda12/stable.html`
4. `pip install -r backend/requirements.prod.txt -r backend/requirements.ml.txt`
5. Настроить `.env` (Ollama URL, CORS origins, DB path)
6. `sudo bash deploy/deploy.sh <repo-url>`
7. Переключить с SQLite на PostgreSQL (опционально, позже)
8. Добавить Celery + Redis для очереди задач (опционально, позже)

### Известные проблемы:
- Путь к проекту содержит `!` (восклицательный знак): `D:\SZA\! SZA DocDetect\`. На Windows это вызывает проблемы в PowerShell. Решение: работать через `Get-ChildItem "$base\!*"` или юникс-окружение
- На Ubuntu этой проблемы не будет

---

## Правила работы

### Перед написанием кода

- Перечитай соответствующий раздел спецификации.
- Уточни подзадачу и её номер, прежде чем начинать.
- Если что-то не описано в спеке — спроси, не домысливай.

### При реализации

- Точно соблюдай сигнатуры функций, классов и API-эндпоинтов из спецификации.
- Имена полей БД, Pydantic-схем, URL эндпоинтов — только из спеки, без переименований.
- Enum-значения (`pending | running | done | failed | needs_review` и др.) — строго как в спеке.
- Пороговые значения берутся из `Settings` (config.py), не хардкодятся в модулях.

### Backend-соглашения

- Async везде: все обработчики FastAPI и методы модулей — `async def`, если явно не указано иначе.
- `get_db` — через `Depends`, не импортировать сессию напрямую.
- Миграции — только через Alembic, никогда `Base.metadata.create_all()` в проде.
- Логирование — через стандартный `logging`, уровень из `Settings.LOGGING_LEVEL`.
- Исключения API — `HTTPException` с понятными `detail`.

### Frontend-соглашения

- Состояние — только через Zustand-сторы (`configStore`, `jobStore`).
- Прямые вызовы API — только из `api/configApi.js` и `api/jobsApi.js`, не из компонентов.
- Компоненты не держат бизнес-логику — только отображение и вызовы стора.
- Polling реализован в `jobStore.startPolling()` с интервалом 3 секунды.
- Обработка ошибок — через интерцептор в `api/client.js`.

### Что нельзя делать без явного запроса

- Изменять схему БД без создания Alembic-миграции.
- Удалять или переименовывать существующие файлы.
- Менять структуру директорий.
- Переключаться на другие библиотеки (например, заменять PaddleOCR на tesseract).
- Добавлять зависимости в `requirements.txt` или `package.json`.

---

## Команды для проверки

```bash
python main.py run          # Запустить бэкенд
python main.py dev          # Бэкенд + фронтенд одновременно
python main.py test         # Unit-тесты (15 шт.)
python main.py e2e          # API-тесты (15 сценариев)
python main.py pipeline     # Тест пайплайна text_layer
cd frontend && npm run dev  # Фронтенд отдельно
```
