from fastapi import APIRouter, Query
import logging
import io

router = APIRouter(prefix="/logs", tags=["logs"])


class _LogCapture(io.StringIO):
    def __init__(self, max_lines=500):
        super().__init__()
        self.max_lines = max_lines
        self._lines = []

    def write(self, s):
        self._lines.append(s)
        if len(self._lines) > self.max_lines:
            self._lines = self._lines[-self.max_lines:]

    def get_lines(self):
        return self._lines


_capture = _LogCapture()


def setup_log_handler():
    root = logging.getLogger()
    handler = logging.StreamHandler(_capture)
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)-8s %(name)s: %(message)s", "%H:%M:%S"))
    handler.setLevel(logging.DEBUG)
    root.addHandler(handler)


@router.get("")
async def get_logs(lines: int = Query(200, ge=1, le=500)):
    return {"lines": _capture.get_lines()[-lines:], "total": len(_capture.get_lines())}
