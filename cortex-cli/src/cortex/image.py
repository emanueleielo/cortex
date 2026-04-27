"""Image generation: codex shell-out (default) + OpenAI HTTP fallback.

Architecture: providers are PURE image generators (prompt → PNG file).
Layout planning, hotspot bboxes, and frontmatter wiring live in the CLI —
that way openai (no agent loop) and codex (with agent loop) behave identically.

Output size: every scene is normalized to `image.size` (default 1536×1024).
- openai gets it as a hard size param.
- codex gets it as a prompt hint AND we post-process the output to pad any
  deviation to the target with cream letterbox borders. Hotspot bboxes are
  remapped to compensate for the padding offsets (see commands/image.py).
"""
from __future__ import annotations

import base64
import json
import math
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from cortex import config, paths


OPENAI_URL = "https://api.openai.com/v1/images/generations"


def target_size() -> tuple[int, int]:
    raw = (config.get("image.size") or "1536x1024").lower()
    try:
        w, h = raw.split("x")
        return (int(w), int(h))
    except Exception:
        return (1536, 1024)


def _size_str() -> str:
    w, h = target_size()
    return f"{w}x{h}"


# ─── deterministic layouts ─────────────────────────────────────────────────
#
# (x, y, w, h, cardinal_label) — bbox in normalized 0..1 image coords.
# Picked to spread elements across a wide-ish canvas (1536×1024 typical) with
# breathing room. Image models don't respect coords precisely; we use cardinal
# language in the prompt and the bbox for the actual click region.

_LAYOUTS: dict[int, list[tuple[float, float, float, float, str]]] = {
    1: [(0.15, 0.15, 0.70, 0.70, "centered, occupying most of the canvas")],
    2: [
        (0.05, 0.18, 0.42, 0.64, "left half"),
        (0.53, 0.18, 0.42, 0.64, "right half"),
    ],
    3: [
        (0.04, 0.20, 0.28, 0.60, "left third"),
        (0.36, 0.20, 0.28, 0.60, "center"),
        (0.68, 0.20, 0.28, 0.60, "right third"),
    ],
    4: [
        (0.05, 0.08, 0.40, 0.40, "upper-left"),
        (0.55, 0.08, 0.40, 0.40, "upper-right"),
        (0.05, 0.52, 0.40, 0.40, "lower-left"),
        (0.55, 0.52, 0.40, 0.40, "lower-right"),
    ],
    5: [
        (0.04, 0.06, 0.28, 0.40, "upper-left"),
        (0.36, 0.04, 0.28, 0.40, "upper-center"),
        (0.68, 0.06, 0.28, 0.40, "upper-right"),
        (0.18, 0.54, 0.28, 0.40, "lower-left"),
        (0.54, 0.54, 0.28, 0.40, "lower-right"),
    ],
    6: [
        (0.03, 0.06, 0.30, 0.40, "upper-left"),
        (0.35, 0.06, 0.30, 0.40, "upper-center"),
        (0.67, 0.06, 0.30, 0.40, "upper-right"),
        (0.03, 0.54, 0.30, 0.40, "lower-left"),
        (0.35, 0.54, 0.30, 0.40, "lower-center"),
        (0.67, 0.54, 0.30, 0.40, "lower-right"),
    ],
}

# Layouts for the "partial" coverage case: the listed children represent
# only some of the parent's concerns (typical of an incremental scan that
# attaches a sub-tree under an existing multi-feature parent). Children
# get small corner-anchored bboxes so the rest of the canvas can read as
# the parent's unmapped breadth instead of being swallowed by the single
# new feature. Defined for n=1..2 — for n>=3 the default layout already
# distributes children small enough that the canvas reads as a busy place.
_LAYOUTS_PARTIAL: dict[int, list[tuple[float, float, float, float, str]]] = {
    1: [(0.72, 0.08, 0.22, 0.22,
         "small labeled landmark in the top-right corner, occupying about a fifth of the canvas — one feature among many")],
    2: [
        (0.06, 0.08, 0.22, 0.30,
         "labeled landmark in the top-left corner, small relative to the canvas"),
        (0.72, 0.08, 0.22, 0.30,
         "labeled landmark in the top-right corner, small relative to the canvas"),
    ],
}


def plan_layout(n: int, coverage: str = "exhaustive") -> list[dict]:
    """Return N bboxes (in canvas-relative normalized coords) for an N-child
    parent scene. For n in 1..6 uses hand-tuned arrangements; falls back to
    a regular grid for higher n. `coverage="partial"` swaps to corner-anchored
    bboxes for n in 1..2 so the parent's broader identity stays readable."""
    if coverage == "partial" and n in _LAYOUTS_PARTIAL:
        table = _LAYOUTS_PARTIAL[n]
    elif n in _LAYOUTS:
        table = _LAYOUTS[n]
    else:
        table = None
    if table is not None:
        return [
            {"x": x, "y": y, "w": w, "h": h, "where": where}
            for (x, y, w, h, where) in table
        ]
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = max(1, math.ceil(n / cols))
    pad_x = 0.03
    pad_y = 0.03
    cell_w = (1.0 - pad_x * 2) / cols - 0.01
    cell_h = (1.0 - pad_y * 2) / rows - 0.01
    out: list[dict] = []
    for i in range(n):
        c = i % cols
        r = i // cols
        out.append({
            "x": pad_x + c * (cell_w + 0.01),
            "y": pad_y + r * (cell_h + 0.01),
            "w": cell_w,
            "h": cell_h,
            "where": f"row {r+1}, column {c+1} of a {rows}×{cols} grid",
        })
    return out


# ─── prompt builders ──────────────────────────────────────────────────────

def _style() -> str:
    return (config.get("image.style") or "").strip()


def build_leaf_prompt(
    *,
    title: str,
    description: str,
    tags: list[str] | None = None,
    color: str = "",
    extra: str | None = None,
) -> str:
    """For a scene without children — pure thematic illustration."""
    parts: list[str] = []
    style = _style()
    if style:
        parts.append(style)
    if title:
        parts.append(f"Subject: {title}.")
    if description:
        parts.append(f"Description: {description.strip()}")
    if tags:
        parts.append(f"Themes / tags: {', '.join(tags)}.")
    if color:
        parts.append(f"Dominant color hint for the scene: {color}.")
    if extra:
        parts.append(extra.strip())
    parts.append(f"Format: generate the image at {_size_str()} (wide landscape).")
    return "\n\n".join(parts)


# Backwards-compat alias for callers that don't know about parents/leaves.
build_prompt = build_leaf_prompt


def build_parent_prompt(
    *,
    title: str,
    description: str,
    children: list[dict],
    layout: list[dict],
    tags: list[str] | None = None,
    color: str = "",
    extra: str | None = None,
    coverage: str = "exhaustive",
) -> str:
    """For a scene that owns N children. We tell the image model:

    1. Style preset.
    2. The scene's parent context (title + description + tags + color hint).
    3. For each child: id (must appear LITERALLY as a label) + cardinal position
       + child tags + a richer description (up to 800 chars).
    4. Strict rules: don't omit any child.

    `coverage` flips two things:
    - "exhaustive" — the listed children fully describe the parent, so the
      painter is told to render only those N elements and nothing else.
      Right for fresh umbrellas / freshly-discovered roots.
    - "partial" — the listed children are SOME of the parent's concerns;
      the painter is told to render the N labeled elements PLUS additional
      unlabeled ambient zones for the unexplored breadth. Right for an
      incremental scan that attached a sub-tree under an established
      multi-feature parent — without this flip the parent's identity
      collapses into the new child.
    """
    if len(layout) != len(children):
        raise ValueError(f"layout has {len(layout)} slots but {len(children)} children")

    style = _style()
    n = len(children)
    pos_lines: list[str] = []
    for child, slot in zip(children, layout):
        cid = child["id"]
        ctitle = child.get("title") or cid
        cdesc = (child.get("description") or "").strip().replace("\n", " ")
        cdesc_short = f" — {cdesc[:800]}" if cdesc else ""
        ctags = child.get("tags") or []
        ctags_str = f" [tags: {', '.join(ctags)}]" if ctags else ""
        pos_lines.append(
            f"- **{cid}** ({ctitle}){ctags_str}{cdesc_short} → place in the {slot['where']} "
            f"(bbox approx x={slot['x']:.2f}, y={slot['y']:.2f}, "
            f"w={slot['w']:.2f}, h={slot['h']:.2f} of the canvas)"
        )

    parts: list[str] = []
    if style:
        parts.append(style)

    parts.append(f"# Scene: {title}")
    if description:
        parts.append(description.strip())
    if tags:
        parts.append(f"Themes / tags for this scene: {', '.join(tags)}.")
    if color:
        parts.append(f"Dominant color hint for the scene: {color}.")

    if coverage == "partial":
        parts.append(
            f"This scene depicts a BROADER PLACE. It MUST contain exactly {n} "
            f"distinct LABELED clickable element(s) — one per listed child, "
            f"at the indicated position — AND additional UNLABELED ambient "
            f"visual zones (workshops, alcoves, smaller pavilions, secondary "
            f"streets, distant buildings) representing other areas of this "
            f"parent that have not yet been explored. The labeled element(s) "
            f"are ONE feature of the place, not the place itself."
        )
    else:
        parts.append(
            f"This scene is a NAVIGATION HUB. It MUST contain exactly {n} distinct "
            f"labeled visual elements — one per child below — each at the position "
            f"indicated. The viewer will click on these labeled elements to navigate."
        )
    parts.append("## Children to depict (with positions)")
    parts.append("\n".join(pos_lines))

    common_rules = (
        "- Each listed child becomes ONE distinct, clearly labeled element "
        "(a labeled building, pavilion, cabinet, archive, kiosk — pick a "
        "single metaphor and use it consistently for ALL listed children).\n"
        "- The id text MUST be visibly written on or directly beside each "
        "labeled element (banner, plaque, sign). Render the id LITERALLY — "
        "do NOT paraphrase, translate, or invent generic names.\n"
        "- Honor the indicated positions reasonably (the image model is not "
        "exact; aim for the cardinal direction and rough scale).\n"
        "- Labeled elements must NOT overlap; leave breathing room.\n"
        "- The whole scene should feel like ONE coherent place."
    )
    if coverage == "partial":
        coverage_rule = (
            "- DO include other UNLABELED visual zones (additional rooms, "
            "secondary buildings, alcoves, distant landmarks) representing "
            "the parent's unmapped areas. These are unexplored parts of the "
            "parent, NOT invented services. They MUST NOT carry labels, "
            "signs, or readable text — only the listed children get labels."
        )
    else:
        coverage_rule = "- Do NOT add extra fictional services not listed above."
    parts.append("## Hard rules\n" + common_rules + "\n" + coverage_rule)
    if extra:
        parts.append(extra.strip())
    parts.append(f"## Format\nGenerate the image at {_size_str()} (wide landscape).")
    return "\n\n".join(parts)


# ─── codex provider ────────────────────────────────────────────────────────

def gen_via_codex(prompt: str, output: Path) -> None:
    """Pure image generator: prompt → PNG. No agent loop, no metadata.

    Each call runs codex in its own ephemeral workspace (`-C tmp_root`) AND
    its own ephemeral CODEX_HOME, seeded with auth.json + config.toml from
    the real ~/.codex/. Both isolations are required: codex 0.125.0
    misroutes generated images between concurrent sessions that share
    CODEX_HOME, even when `-C` workspaces are distinct (6-way parallel
    repro: sources unique, delivered out.png duplicated). Per-call
    CODEX_HOME closes the race; the tempdir (workspace + seeded home) is
    removed automatically on exit.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    timeout = int(config.get("image.codex.timeout") or 600)
    real_codex_home = Path.home() / ".codex"

    with tempfile.TemporaryDirectory(prefix="cortex-imggen-") as tmp:
        tmp_root = Path(tmp)
        rel_output = Path("out.png")
        tmp_output = tmp_root / rel_output
        codex_home = tmp_root / ".codex-home"
        codex_home.mkdir()
        for fname in ("auth.json", "config.toml"):
            src = real_codex_home / fname
            if src.exists():
                shutil.copy2(src, codex_home / fname)
        env = {**os.environ, "CODEX_HOME": str(codex_home)}
        instruction = (
            f"{prompt}\n\n"
            f"Save the resulting PNG image to: {rel_output} (relative to the workspace root).\n"
            f"Do not produce any other files. Do not modify any other files. "
            f"Do not view, edit, or analyze the generated image afterwards.\n"
            f"If the file is created successfully, reply with the single word: OK.\n"
            f"If you cannot produce an image, reply with: FAIL <reason>."
        )
        proc = subprocess.run(
            [
                "codex", "exec",
                "-C", str(tmp_root),
                "--sandbox", "workspace-write",
                "--skip-git-repo-check",
                instruction,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
        if proc.returncode != 0:
            raise SystemExit(f"codex exec failed (rc={proc.returncode}):\n{proc.stderr or proc.stdout}")
        if not tmp_output.exists():
            tail = (proc.stdout or proc.stderr or "")[-400:]
            raise SystemExit(f"codex did not produce an image at {tmp_output}.\nlast output:\n{tail}")
        shutil.move(str(tmp_output), str(output))


# ─── openai provider ───────────────────────────────────────────────────────

def gen_via_openai(prompt: str, output: Path) -> None:
    """POST to images/generations and decode the b64 PNG."""
    token = config.get("image.openai.token") or os.environ.get("OPENAI_API_KEY") or ""
    if not token:
        raise SystemExit(
            "OpenAI token not configured. set with:\n"
            "  cortex config set image.openai.token sk-...\n"
            "or export OPENAI_API_KEY in the environment."
        )
    model = config.get("image.openai.model") or "gpt-image-1"
    size = _size_str()

    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        OPENAI_URL,
        data=body,
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
        except Exception:
            err_body = ""
        raise SystemExit(f"openai HTTP {e.code}:\n{err_body or e.reason}")
    except urllib.error.URLError as e:
        raise SystemExit(f"openai network error: {e.reason}")

    items = data.get("data") or []
    if not items:
        raise SystemExit(f"openai returned no images: {data}")
    item = items[0]

    output.parent.mkdir(parents=True, exist_ok=True)
    if "b64_json" in item and item["b64_json"]:
        output.write_bytes(base64.b64decode(item["b64_json"]))
        return
    if "url" in item and item["url"]:
        with urllib.request.urlopen(item["url"], timeout=120) as r:
            output.write_bytes(r.read())
        return
    raise SystemExit(f"openai response missing b64_json/url: {item}")


# ─── dispatch ──────────────────────────────────────────────────────────────

def generate(*, provider: str, prompt: str, output: Path) -> None:
    """Provider-agnostic image gen. Both codex and openai are pure
    `prompt → PNG` here. Layout, bboxes, and frontmatter are the CLI's job."""
    if provider == "codex":
        gen_via_codex(prompt, output)
    elif provider == "openai":
        gen_via_openai(prompt, output)
    else:
        raise SystemExit(f"unknown image provider: {provider!r} (valid: codex, openai)")
