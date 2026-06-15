import base64
import json
from io import BytesIO
from dataclasses import dataclass
import numpy as np
import httpx
from PIL import Image

from backend.config import Settings
from backend.modules.text_layer import PageAssignment


@dataclass
class VLMResult:
    type_id: str
    confidence: float
    raw_response: str | None = None


WHITE_PAGE_BASE64: str = ""


def _generate_white_page() -> str:
    img = Image.new("RGB", (800, 1000), (255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


WHITE_PAGE_BASE64 = _generate_white_page()

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
        pil_img = Image.fromarray(image.astype(np.uint8))
        buf = BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    def _build_context_string(self, recent_pages: list[PageAssignment]) -> str:
        parts = []
        for p in recent_pages:
            parts.append(f"стр.{p.page_number}: {p.doc_type_id or 'undetected'} (conf: {p.confidence:.2f})")
        return "; ".join(parts)

    def _build_doc_types_string(self, doc_types: list) -> str:
        parts = [f"{dt.id}: {dt.name}" for dt in doc_types]
        return ", ".join(parts)

    async def classify_page(
        self,
        prev_image: np.ndarray | None,
        target_image: np.ndarray,
        next_image: np.ndarray | None,
        document_types: list,
        recent_context: list[PageAssignment],
    ) -> VLMResult:
        def img_or_white(img):
            return self._image_to_base64(img) if img is not None else WHITE_PAGE_BASE64

        images_b64 = [
            img_or_white(prev_image),
            img_or_white(target_image),
            img_or_white(next_image),
        ]

        prompt = PROMPT_TEMPLATE.format(
            context=self._build_context_string(recent_context),
            doc_types=self._build_doc_types_string(document_types),
        )

        payload = {
            "model": self.model,
            "stream": False,
            "messages": [{
                "role": "user",
                "content": prompt,
                "images": images_b64,
            }],
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data.get("message", {}).get("content", "")
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError:
                    import re
                    match = re.search(r'\{[^{}]*"type"[^{}]*"confidence"[^{}]*\}', content, re.DOTALL)
                    if match:
                        parsed = json.loads(match.group())
                    else:
                        logger.warning("VLM response is not valid JSON: %s", content[:200])
                        return VLMResult(type_id="undetected", confidence=0.0, raw_response=content)
                return VLMResult(
                    type_id=parsed.get("type", "undetected"),
                    confidence=float(parsed.get("confidence", 0.0)),
                    raw_response=content,
                )
        except Exception as e:
            logger.error("VLM request failed: %s", e)
            return VLMResult(type_id="undetected", confidence=0.0, raw_response=None)
