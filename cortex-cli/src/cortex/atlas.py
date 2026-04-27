"""Bridge between the markdown store and the Cortex React app's Scene[] shape.

A "scene" in the React app is the visual face of a note. This module reads the
notes on disk and emits a JSON document matching the shape the React app
expects (compatible with the existing src/data/atlas.json format).

Mapping rules:
- id, title, tags, people, createdAt → from frontmatter
- description → frontmatter `description`, fallback to first paragraph of body
- text → full markdown body (Reading mode reads this)
- parentId → derived from folder hierarchy: sibling-named convention.
  For `notes/<dir>/<file>.md`, the parent is `notes/<dir>.md` (the file
  sitting next to the dir, with the dir's name). Walks up if not found.
- sceneAsset → cortex.sceneAsset, paths "assets/foo.png" rewritten to "/cortex-asset/foo.png"
- position, color, domain, sceneSize, hotspots → from `cortex` frontmatter sub-tree
- connectsTo → wikilinks in body, with optional kind
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from cortex import parser, store


ASSET_URL_PREFIX = "/cortex-asset/"
ASSET_DIR_PREFIX = "assets/"


def _first_paragraph(body: str) -> str:
    """First non-empty paragraph of body, single-spaced."""
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    if not paragraphs:
        return ""
    # strip wikilinks-only paragraphs (e.g. trailing [[link]] lines)
    for p in paragraphs:
        s = p.replace("\n", " ").strip()
        # if the paragraph is entirely wikilinks, skip
        without_links = parser.WIKILINK_RE.sub("", s).strip(" ,.;:")
        if without_links:
            return s
    return ""


def _derive_parent_id(
    note_path: Path,
    notes_root: Path,
    notes_by_path: dict[Path, store.Note],
) -> str | None:
    """Sibling-named parent: notes/<dir>/<x>.md → parent is notes/<dir>.md.

    Walks up if no immediate sibling-named parent is found.
    Returns None for root-level scenes (top-level files in notes/).
    """
    if not note_path.is_relative_to(notes_root):
        return None
    parent_dir = note_path.parent
    while parent_dir.is_relative_to(notes_root) and parent_dir != notes_root:
        sibling = parent_dir.parent / f"{parent_dir.name}.md"
        if sibling.exists() and sibling != note_path:
            parent_note = notes_by_path.get(sibling)
            if parent_note:
                return parent_note.id
        parent_dir = parent_dir.parent
    return None


def _rewrite_asset(asset: str | None) -> str | None:
    """assets/foo.png → /cortex-asset/foo.png (URL the Vite plugin serves)."""
    if not asset:
        return None
    if asset.startswith(ASSET_DIR_PREFIX):
        return ASSET_URL_PREFIX + asset[len(ASSET_DIR_PREFIX):]
    # already an absolute URL or relative-to-public path → pass through
    return asset


def note_to_scene(
    note: store.Note,
    notes_root: Path,
    notes_by_path: dict[Path, store.Note],
) -> dict[str, Any]:
    fm = note.fm
    cortex_meta = (fm.get("cortex") or {}) if isinstance(fm.get("cortex"), dict) else {}

    description = fm.get("description")
    if not description:
        description = _first_paragraph(note.body)

    # Dedup wikilinks by (target, kind). Bodies routinely mention the same
    # target more than once — e.g. `[[X]]` in prose plus a trailing
    # `Children: [[X]], [[Y]]` line — and the FE shouldn't render that as
    # two separate "X LINK" rows. Different kinds for the same target stay
    # (those are semantically distinct relationships, e.g. link + uses).
    #
    # `[[id|X]]` is overloaded in the wikilink syntax: X can be a typed
    # relation kind (uses / feeds / …) OR just inline display text for
    # prose like `[[ciana-tools|RoutingChatModel]]`. Treating every label
    # as a kind pollutes the Related panel with one-off groups
    # (`ROUTINGCHATMODEL`, …); demote anything outside the closed taxonomy
    # to `kind=link` here so the connectsTo data carries only real kinds.
    connects: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for link in parser.extract_links(note.body):
        raw_kind = link.kind
        kind = raw_kind if raw_kind in parser.KNOWN_KINDS else "link"
        key = (link.target_id, kind)
        if key in seen:
            continue
        seen.add(key)
        connects.append({"sceneId": link.target_id, "kind": kind})

    scene: dict[str, Any] = {
        "id": note.id,
        "parentId": _derive_parent_id(note.path, notes_root, notes_by_path),
        "title": note.title,
        "description": description,
        "createdAt": str(fm.get("created") or store.today()),
    }

    body_clean = note.body.strip()
    if body_clean:
        scene["text"] = body_clean

    asset = _rewrite_asset(cortex_meta.get("sceneAsset"))
    if asset:
        scene["sceneAsset"] = asset

    for key in ("sceneSize", "position", "color", "domain"):
        if cortex_meta.get(key) is not None:
            scene[key] = cortex_meta[key]

    # Hotspot bboxes are stored in cortex normalized 0..1 (provider-agnostic),
    # but the React app's <image> SVG uses a viewBox in image-pixel coords —
    # the same units as <rect> on top. Convert here so the front-end stays
    # ignorant of normalization.
    raw_hotspots = cortex_meta.get("hotspots")
    if raw_hotspots:
        size = cortex_meta.get("sceneSize") or {}
        sw = float(size.get("width") or 1)
        sh = float(size.get("height") or 1)
        denormalized: list[dict[str, Any]] = []
        for h in raw_hotspots:
            if not isinstance(h, dict):
                continue
            bbox = h.get("bbox") or {}
            denormalized.append({
                **h,
                "bbox": {
                    "x": float(bbox.get("x", 0)) * sw,
                    "y": float(bbox.get("y", 0)) * sh,
                    "w": float(bbox.get("w", 0)) * sw,
                    "h": float(bbox.get("h", 0)) * sh,
                },
            })
        scene["hotspots"] = denormalized

    if fm.get("tags"):
        scene["tags"] = list(fm["tags"])
    if fm.get("people"):
        scene["people"] = list(fm["people"])
    if connects:
        scene["connectsTo"] = connects

    return scene


def build_scenes(root: Path) -> list[dict[str, Any]]:
    """Walk the store and emit Scene[] in deterministic order (sorted by id)."""
    notes = list(store.iter_notes(root))
    notes_by_path = {n.path: n for n in notes}
    notes_root = root / "notes"
    scenes = [note_to_scene(n, notes_root, notes_by_path) for n in notes]
    scenes.sort(key=lambda s: s["id"])
    return scenes
