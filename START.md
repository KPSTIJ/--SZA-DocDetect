# PDF Dossier Splitter — Быстрый старт

## 1. Установка зависимостей

### Python 3.11 (бэкенд)

```bash
# Создать виртуальное окружение (из корня проекта)
python -m venv venv311

# Активировать
.\venv311\Scripts\Activate.ps1

# Установить зависимости
pip install -r backend\requirements.txt
pip install -r backend\requirements.ml.txt
pip install pytest reportlab
```

### Node.js (фронтенд)

```bash
cd frontend
npm install
cd ..
```

---

## 2. Настройка окружения

Скопировать `.env.example` → `.env` и отредактировать:

```bash
copy .env.example .env
```

Минимальное содержимое `.env`:

```env
OLLAMA_BASE_URL=http://192.168.51.247:11434
OLLAMA_MODEL=qwen3-vl:8b
```

(Замените URL на адрес вашего Ollama-сервера)

---

## 3. Запуск

### Терминал 1 — бэкенд

```bash
.\venv311\Scripts\Activate.ps1
python main.py run
```

После запуска:
- API: `http://localhost:8000/`
- Swagger-документация: `http://localhost:8000/docs`
- Health-check: `http://localhost:8000/health`

### Терминал 2 — фронтенд

```bash
cd frontend
npm run dev
```

После запуска:
- Интерфейс: `http://localhost:5173`

---

## 4. Проверка работоспособности

### Unit-тесты (15 тестов)
```bash
python main.py test
```

### API-тесты (15 сценариев)
```bash
python main.py e2e
```

### Тест пайплайна (text_layer)
```bash
python main.py pipeline
```

---

## 5. Быстрый сценарий использования

1. Открыть `http://localhost:5173`
2. Вкладка **Настройки** → **Добавить тип документа**
   - ID: `contract`
   - Название: `Договор`
   - Паттерны: `договор`, `contract`, `agreement`
   - Страниц: от 1 до 10
3. Перетащить PDF-файл в область загрузки
4. Нажать **Запустить обработку**
5. Перейти на вкладку **Разбор** — увидеть результат
6. При необходимости переназначить типы страниц и нажать **Подтвердить и склеить**

---

## 6. Известные ограничения

| Проблема | Решение |
|----------|---------|
| PaddleOCR не работает (ошибка oneDNN) | Используйте text_layer для PDF с текстом или VLM для сканов |
| Ollama недоступен (`ECONNREFUSED`) | Запустите `ollama serve` или проверьте URL в `.env` |
| Фронтенд не видит бэкенд | Убедитесь, что `python main.py run` запущен в другом терминале |

---

## 7. Структура проекта

```
backend/             # FastAPI + SQLAlchemy + ML-модули
  api/               # REST-эндпоинты
  core/              # Оркестратор пайплайна
  modules/           # text_layer, ocr, cv, fusion, vlm
  services/          # pdf_service, file_service
  models/            # Pydantic-схемы, ORM-модели
  tests/             # unit-тесты
frontend/            # React + Ant Design + Vite
  src/
    api/             # axios-клиент
    store/           # Zustand-сторы
    components/      # React-компоненты
main.py              # Точка входа (run/test/e2e/pipeline)
```
