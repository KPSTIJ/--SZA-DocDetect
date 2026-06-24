import logging
from dataclasses import dataclass, field
import numpy as np

logger = logging.getLogger(__name__)

try:
    from doclayout_yolo import YOLOv10
except ImportError:
    YOLOv10 = None


@dataclass
class LayoutBlock:
    label: str
    bbox: list[float]
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
    STAMP_LABELS = {"figure"}
    TITLE_LABELS = {"title", "section_header"}
    TEXT_LABELS  = {"text", "plain text"}

    BOTTOM_ZONE_Y = 0.65
    TOP_RIGHT_X   = 0.55
    TOP_ZONE_Y    = 0.35

    def __init__(self, model_path: str | None = None):
        if model_path is None:
            try:
                from huggingface_hub import hf_hub_download
                model_path = hf_hub_download(
                    "juliozhao/DocLayout-YOLO-DocStructBench",
                    "doclayout_yolo_docstructbench_imgsz1024.pt",
                )
            except Exception as e:
                logger.warning("Cannot download DocLayoutYOLO model: %s", e)
                model_path = "doclayout_yolo_docstructbench_imgsz1024.pt"
        try:
            self.model = YOLOv10(model_path)
        except Exception as e:
            logger.warning("DocLayoutYOLO model not available: %s", e)
            self.model = None

    def detect_layout(self, image: np.ndarray) -> list[LayoutBlock]:
        if self.model is None:
            logger.warning("CVModule: model not loaded, returning empty layout")
            return []
        results = self.model.predict(
            image, imgsz=1024, conf=0.25,
            device="cpu", verbose=False,
        )
        blocks = []
        h, w = image.shape[:2]
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                label = result.names[int(box.cls[0])]
                blocks.append(LayoutBlock(
                    label=label.lower(),
                    bbox=[x1 / w, y1 / h, x2 / w, y2 / h],
                    confidence=float(box.conf[0]),
                ))
        return blocks

    def detect_visual_patterns(self, image: np.ndarray) -> VisualPatterns:
        blocks = self.detect_layout(image)
        patterns = VisualPatterns(raw_blocks=blocks)

        for block in blocks:
            x1, y1, x2, y2 = block.bbox
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

            if block.label in self.STAMP_LABELS:
                if cy > self.BOTTOM_ZONE_Y:
                    block_h = y2 - y1
                    block_w = x2 - x1
                    aspect = block_w / block_h if block_h > 0 else 0
                    if 0.7 < aspect < 1.4:
                        patterns.has_stamp = True
                    else:
                        patterns.has_signature = True
                elif cx > self.TOP_RIGHT_X and cy < self.TOP_ZONE_Y:
                    block_h = y2 - y1
                    block_w = x2 - x1
                    if block_h > 0.05 and block_w > 0.05:
                        patterns.has_photo_top_right = True

            if block.label in self.TITLE_LABELS and cy < self.TOP_ZONE_Y:
                patterns.has_title_block = True

        patterns.is_likely_last_page = patterns.has_stamp or patterns.has_signature
        patterns.is_likely_title_page = patterns.has_title_block

        return patterns
