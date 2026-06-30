import os
from fastapi import APIRouter, Query
import logging

router = APIRouter(prefix="/logs", tags=["logs"])

LOG_FILE = "/tmp/uvicorn10.log"


def _read_logs(max_lines=500):
    try:
        if not os.path.exists(LOG_FILE):
            return []
        with open(LOG_FILE, "r") as f:
            all_lines = f.readlines()
        return [l.rstrip("\n") for l in all_lines[-max_lines:]]
    except Exception:
        return []


def setup_log_handler():
    root = logging.getLogger()
    fh = logging.FileHandler(LOG_FILE, mode="a")
    fh.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)-8s %(name)s: %(message)s", "%H:%M:%S"))
    fh.setLevel(logging.DEBUG)
    root.addHandler(fh)
    root.setLevel(logging.DEBUG)


@router.get("")
async def get_logs(lines: int = Query(200, ge=1, le=500)):
    log_lines = _read_logs(lines)
    return {"lines": log_lines, "total": len(log_lines)}
