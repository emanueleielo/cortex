"""Post-processing for generated PNGs: pad-to-target with cream letterbox.

After codex/openai produce an image (potentially at a non-target aspect),
we letterbox-fit the content into the canonical target canvas and update
hotspot bboxes to compensate for the padding offsets.

Hotspot bboxes are normalized 0..1 of the IMAGE the model actually produced
(model's own canvas). After padding to target, the visible content occupies
only a sub-rectangle of the target canvas; the bboxes are remapped to
normalized 0..1 of the target canvas.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image


def _hex_to_rgb(s: str) -> tuple[int, int, int]:
    s = s.strip().lstrip("#")
    if len(s) != 6:
        return (250, 246, 237)  # #FAF6ED fallback
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return (250, 246, 237)


def pad_to_target(
    png_path: Path,
    target_w: int,
    target_h: int,
    *,
    bg_hex: str = "#FAF6ED",
    hotspots: list[dict] | None = None,
) -> tuple[tuple[int, int], list[dict] | None]:
    """Read `png_path`, letterbox-fit into (target_w, target_h) with `bg_hex`
    fill, write back to `png_path`. If `hotspots` is given, each bbox (in
    normalized 0..1 of the source image) is remapped to normalized 0..1 of
    the target canvas, accounting for the letterbox offsets.

    Returns ((target_w, target_h), remapped_hotspots).
    """
    img = Image.open(png_path).convert("RGB")
    src_w, src_h = img.size

    if (src_w, src_h) == (target_w, target_h):
        return (target_w, target_h), hotspots

    # letterbox-fit math
    scale = min(target_w / src_w, target_h / src_h)
    new_w = max(1, int(round(src_w * scale)))
    new_h = max(1, int(round(src_h * scale)))
    ox = (target_w - new_w) / 2
    oy = (target_h - new_h) / 2

    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), _hex_to_rgb(bg_hex))
    canvas.paste(resized, (int(round(ox)), int(round(oy))))
    canvas.save(png_path, "PNG", optimize=True)

    if hotspots is None:
        return (target_w, target_h), None

    remapped: list[dict] = []
    for h in hotspots:
        bbox = h.get("bbox") or {}
        # source bbox in pixels (model canvas):
        sx_px = float(bbox.get("x", 0)) * src_w
        sy_px = float(bbox.get("y", 0)) * src_h
        sw_px = float(bbox.get("w", 0)) * src_w
        sh_px = float(bbox.get("h", 0)) * src_h
        # mapped into target pixel space (after letterbox shift+scale):
        tx_px = ox + sx_px * scale
        ty_px = oy + sy_px * scale
        tw_px = sw_px * scale
        th_px = sh_px * scale
        # back to normalized 0..1 of target canvas:
        remapped.append({
            **h,
            "bbox": {
                "x": tx_px / target_w,
                "y": ty_px / target_h,
                "w": tw_px / target_w,
                "h": th_px / target_h,
            },
        })
    return (target_w, target_h), remapped
