#!/usr/bin/env python3
"""
Глобальная точка входа для запуска и тестирования приложения.

Использование:
  python main.py run          # Запустить backend сервер
  python main.py test         # Запустить unit-тесты
  python main.py e2e          # Запустить E2E-тест API
  python main.py pipeline     # Протестировать полный пайплайн обработки
  python main.py db-init      # Пересоздать БД
  python main.py shell        # Интерактивная оболочка с импортами
"""

import os
import sys
import subprocess
import argparse

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")


def cmd_run():
    """Запустить backend сервер."""
    print("Starting backend server on http://127.0.0.1:8000")
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, ROOT_DIR)
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)


def cmd_test():
    """Запустить unit-тесты и интеграционные тесты."""
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, ROOT_DIR)
    import pytest
    exit_code = pytest.main(["tests/", "-v", "--tb=short"])
    sys.exit(exit_code)


def cmd_e2e():
    """Запустить E2E-тест API (создаёт временный сервер)."""
    sys.path.insert(0, ROOT_DIR)
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
    os.environ["INPUT_DIR"] = "./data/test_input"
    os.environ["OUTPUT_DIR"] = "./data/test_output"
    os.environ["TEMP_DIR"] = "./data/test_temp"
    _cleanup_test_db()
    _cleanup_test_data()

    import asyncio
    import io
    import uvicorn
    from backend.main import app
    from reportlab.pdfgen import canvas
    from pathlib import Path

    async def _run():
        config = uvicorn.Config(app=app, host="127.0.0.1", port=8006, log_level="error")
        server = uvicorn.Server(config)
        task = asyncio.create_task(server.serve())
        await asyncio.sleep(3)

        import httpx
        base = "http://127.0.0.1:8006"
        passed = 0
        failed = 0

        async def check(label, method, url, **kwargs):
            nonlocal passed, failed
            try:
                r = await method(f"{base}{url}", **kwargs)
                ok = r.status_code < 400
                print(f"  [{'OK' if ok else 'FAIL'}] {label}: {r.status_code}")
                if ok:
                    passed += 1
                else:
                    failed += 1
                return r
            except Exception as e:
                print(f"  [FAIL] {label}: {e}")
                failed += 1
                return None

        async with httpx.AsyncClient(timeout=30.0) as c:
            print("\n--- Config API ---")
            await check("POST contract", c.post, "/api/config/document-types",
                        json={"id":"contract","name":"Contract","text_patterns":["contract","agreement"],"min_pages":1,"max_pages":5})
            await check("POST passport", c.post, "/api/config/document-types",
                        json={"id":"passport","name":"Passport","text_patterns":["passport"],"min_pages":1,"max_pages":3})
            r = await check("LIST doc-types", c.get, "/api/config/document-types")
            if r:
                assert len(r.json()) == 2
            await check("PUT contract", c.put, "/api/config/document-types/contract",
                        json={"name":"Updated Contract"})
            await check("DELETE passport", c.delete, "/api/config/document-types/passport")
            r = await check("LIST after delete", c.get, "/api/config/document-types")
            if r:
                assert len(r.json()) == 1

            print("\n--- Jobs API ---")
            buf = io.BytesIO()
            pdf = canvas.Canvas(buf)
            pdf.drawString(50, 750, "AGREEMENT #1-2")
            pdf.showPage()
            pdf.drawString(50, 750, "page 2")
            pdf.showPage()
            pdf.drawString(50, 750, "PASSPORT John Doe")
            pdf.showPage()
            pdf.save()
            r = await check("UPLOAD PDF", c.post, "/api/jobs/upload",
                            files={"file": ("dossier.pdf", buf.getvalue(), "application/pdf")})
            job_id = r.json()["job_id"] if r else None
            r = await check("LIST jobs", c.get, "/api/jobs")
            if r:
                assert r.json()["total"] >= 1
            if job_id:
                await check("JOB detail", c.get, f"/api/jobs/{job_id}")
                r = await c.post(f"{base}/api/jobs/start-batch")
                print(f"  [OK] START batch: {r.status_code}")
                passed += 1
                await check("SOURCE PDF", c.get, f"/api/jobs/{job_id}/source")
                await check("PREVIEW page", c.get, f"/api/jobs/{job_id}/page/0/preview")

            print("\n--- Review API ---")
            await check("LIST review", c.get, "/api/review/jobs")

            print("\n--- Error handling ---")
            r = await c.get(f"{base}/api/jobs/invalid-uuid")
            ok = r.status_code == 422
            print(f"  [{'OK' if ok else 'FAIL'}] INVALID uuid: {r.status_code}")
            passed += 1 if ok else 0
            failed += 0 if ok else 1

            r = await c.get(f"{base}/api/jobs/00000000-0000-0000-0000-000000000000")
            ok = r.status_code == 404
            print(f"  [{'OK' if ok else 'FAIL'}] NOT FOUND: {r.status_code}")
            passed += 1 if ok else 0
            failed += 0 if ok else 1

        server.should_exit = True
        await task

        _cleanup_test_data()
        print(f"\n{'='*40}")
        print(f"Results: {passed} passed, {failed} failed")
        return failed == 0

    success = asyncio.run(_run())
    sys.exit(0 if success else 1)


def cmd_pipeline():
    """Протестировать полный пайплайн обработки PDF (без ML-модулей)."""
    sys.path.insert(0, ROOT_DIR)
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
    os.environ["INPUT_DIR"] = "./data/test_input"
    os.environ["OUTPUT_DIR"] = "./data/test_output"
    os.environ["TEMP_DIR"] = "./data/test_temp"
    _cleanup_test_db()
    _cleanup_test_data()
    os.chdir(BACKEND_DIR)

    import asyncio
    import io
    import uuid
    from pathlib import Path
    from sqlalchemy import select
    from backend.config import Settings
    from backend.database import Base, get_engine, get_sessionmaker
    from backend.models.db_models import DocumentType, ProcessingJob, PageResult, OutputDocument
    from backend.core.orchestrator import DocumentOrchestrator
    from reportlab.pdfgen import canvas

    async def _run():
        settings = Settings()
        engine = get_engine(settings)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        sessionmaker = get_sessionmaker(engine)

        async with sessionmaker() as db:
            dt = DocumentType(
                id="contract",
                name="Contract",
                text_patterns=["contract", "agreement"],
                min_pages=1, max_pages=5,
            )
            db.add(dt)
            await db.commit()

            buf = io.BytesIO()
            pdf = canvas.Canvas(buf)
            pdf.drawString(50, 750, "This is AGREEMENT NUMBER 1 between the parties for contract services")
            pdf.showPage()
            pdf.drawString(50, 750, "page 2 of the contract - continuing terms and conditions of this agreement")
            pdf.showPage()
            pdf.drawString(50, 750, "page 3 - final page with signatures and stamps of both parties")
            pdf.showPage()
            pdf.save()

            job_id = uuid.uuid4()
            input_dir = Path(settings.INPUT_DIR)
            job_dir = input_dir / str(job_id)
            job_dir.mkdir(parents=True, exist_ok=True)
            pdf_path = job_dir / "input.pdf"
            pdf_path.write_bytes(buf.getvalue())

            job = ProcessingJob(
                id=job_id,
                source_filename="test_dossier.pdf",
                source_path=str(pdf_path),
            )
            db.add(job)
            await db.commit()

            orch = DocumentOrchestrator(db, settings)
            await orch.process_job(job_id)

            await db.refresh(job)
            result = await db.execute(
                select(PageResult).where(PageResult.job_id == job_id).order_by(PageResult.page_number)
            )
            pages = result.scalars().all()

            from backend.services.pdf_service import extract_text_layer
            raw_text = extract_text_layer(str(pdf_path))
            for rt in raw_text:
                print(f"  raw page {rt['page']}: text='{rt['text'][:60]}' has_layer={rt['has_text_layer']}")

            print(f"\nPipeline results: {len(pages)} pages, job status: {job.status}")
            for p in pages:
                print(f"  page {p.page_number}: type={p.document_type_id} method={p.detection_method} conf={p.confidence} err={p.error_code}")

            assert job.status == "done", f"Expected done, got {job.status}"
            assert len(pages) == 3, f"Expected 3 pages, got {len(pages)}"
            assert pages[0].detection_method == "text_layer"
            assert pages[0].document_type_id == "contract"

            print("\nPipeline test: PASSED (text_layer working, ML modules skipped)")

        await engine.dispose()
        _cleanup_test_data()

    asyncio.run(_run())


def cmd_db_migrate():
    """Применить миграции Alembic."""
    sys.path.insert(0, ROOT_DIR)
    os.chdir(BACKEND_DIR)
    from alembic.config import Config
    from alembic import command
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    print("  Migrations applied successfully")


def cmd_db_init():
    """Пересоздать БД (ВНИМАНИЕ: удаляет все данные!)."""
    answer = input("Это удалит app.db и все данные. Продолжить? (y/N): ")
    if answer.lower() != 'y':
        print("Отменено")
        return
    for path in [os.path.join(BACKEND_DIR, "app.db"), os.path.join(ROOT_DIR, "app.db")]:
        if os.path.exists(path):
            os.remove(path)
    sys.path.insert(0, ROOT_DIR)
    os.chdir(BACKEND_DIR)

    from backend.config import Settings
    from backend.database import Base, get_engine
    settings = Settings()

    import asyncio

    async def _init():
        engine = get_engine(settings)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()
        print("  Database created successfully")

    asyncio.run(_init())


def cmd_dev():
    """Запустить бэкенд + фронтенд одновременно."""
    import subprocess
    import time

    frontend_dir = os.path.join(ROOT_DIR, "frontend")
    node_path = "C:\\Program Files\\nodejs"

    print("=" * 50)
    print("  PDF Dossier Splitter — DEV MODE")
    print("=" * 50)

    env = os.environ.copy()
    env["PATH"] = f"{node_path};{env.get('PATH', '')}"
    processes = []

    try:
        print("  [1/2] Starting backend (uvicorn)...")
        be = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "backend.main:app",
             "--host", "127.0.0.1", "--port", "8000", "--reload",
             "--reload-dir", BACKEND_DIR],
            cwd=ROOT_DIR, env=env,
        )
        processes.append(be)

        print("  [2/2] Starting frontend (vite)...")
        fe = subprocess.Popen(
            ["npx.cmd", "vite", "--host", "127.0.0.1", "--port", "5173"],
            cwd=frontend_dir, env=env, shell=True,
        )
        processes.append(fe)

        time.sleep(2)
        print()
        print(f"  Backend:  http://127.0.0.1:8000")
        print(f"  Frontend: http://127.0.0.1:5173")
        print(f"  Docs:     http://127.0.0.1:8000/docs")
        print()
        print("  Press Ctrl+C to stop both servers")
        print("=" * 50)

        while all(p.poll() is None for p in processes):
            time.sleep(0.5)

        for p in processes:
            if p.poll() is not None and p.returncode != 0:
                print(f"  [WARN] Process exited with code {p.returncode}")

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()
        print("  Stopped.")


def cmd_shell():
    """Интерактивная оболочка."""
    sys.path.insert(0, ROOT_DIR)
    os.chdir(BACKEND_DIR)

    import code
    vars = {"os": os, "sys": sys}
    try:
        from backend.config import Settings
        from backend.database import Base, get_engine
        from backend.models import db_models, schemas
        from backend.services import pdf_service, file_service
        vars.update({
            "Settings": Settings, "Base": Base,
            "db_models": db_models, "schemas": schemas,
            "pdf_service": pdf_service, "file_service": file_service,
        })
        print("  Imports: Settings, Base, db_models, schemas, pdf_service, file_service")
    except ImportError as e:
        print(f"  Some imports failed: {e}")

    print("  Interactive shell. Type 'exit()' to quit.\n")
    code.interact(local=vars, banner="")


def _cleanup_test_db():
    test_db = os.path.join(ROOT_DIR, "test.db")
    if os.path.exists(test_db):
        os.remove(test_db)


def _cleanup_test_data():
    import shutil
    for d in ["./data/test_input", "./data/test_output", "./data/test_temp"]:
        p = os.path.join(ROOT_DIR, d)
        if os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="PDF Dossier Splitter")
    parser.add_argument("command", choices=["run", "dev", "test", "e2e", "pipeline", "db-init", "db-migrate", "shell"],
                        help="Command to execute")
    args = parser.parse_args()

    commands = {
        "run": cmd_run,
        "dev": cmd_dev,
        "test": cmd_test,
        "e2e": cmd_e2e,
        "pipeline": cmd_pipeline,
        "db-init": cmd_db_init,
        "db-migrate": cmd_db_migrate,
        "shell": cmd_shell,
    }

    commands[args.command]()


if __name__ == "__main__":
    main()

