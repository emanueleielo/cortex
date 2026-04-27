"""`cortex mv <old-id> <new-id-or-path>` — rename / move a note.

Updates the .md file location, the note's frontmatter `id`, the corresponding
scene asset (if any), all sibling wikilinks `[[old-id]]` -> `[[new-id]]`,
and any sibling `cortex.hotspots[].childSceneId` references. Re-indexes at
the end. Refuses if the new id already exists.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path

from cortex import git_ops, index, paths, parser, store


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("mv", help="Rename or move a note (and update wikilinks/hotspots)")
    p.add_argument("old_id", help="Existing note id")
    p.add_argument(
        "new_target",
        help="New bare slug (rename in place) OR a relative path under notes/ (move + rename)",
    )
    p.add_argument("--ai", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.set_defaults(fn=run)


def _resolve_target(root: Path, old_path: Path, new_target: str) -> tuple[Path, str]:
    """Return (new_absolute_path, new_id).

    If new_target contains "/" or ends with .md, it's a relative path under
    `notes/`. A leading `notes/` segment is honored if the user spelled it out;
    otherwise it's auto-prepended. Either way the destination is always inside
    `notes/`. Otherwise it's a bare slug — keep the note in its current folder,
    just rename the file.
    """
    notes_root = (root / "notes").resolve()
    looks_like_path = ("/" in new_target) or new_target.endswith(".md")
    if looks_like_path:
        rel = new_target
        if not rel.endswith(".md"):
            rel = rel + ".md"
        rel_path = Path(rel)
        if rel_path.is_absolute():
            raise SystemExit(f"new_target must be a relative path, got: {new_target!r}")
        if rel_path.parts and rel_path.parts[0] == "notes":
            new_path = (root / rel_path).resolve()
        else:
            new_path = (notes_root / rel_path).resolve()
        if new_path != notes_root and notes_root not in new_path.parents:
            raise SystemExit(f"path must be inside {notes_root}")
        new_id = parser.slug(new_path.stem)
    else:
        new_id = parser.slug(new_target)
        if not new_id:
            raise SystemExit(f"could not derive id from {new_target!r}")
        new_path = old_path.parent / f"{new_id}.md"
    return new_path, new_id


def _git_mv(root: Path, src: Path, dst: Path) -> None:
    if git_ops.is_repo(root):
        try:
            git_ops.run(root, "mv", str(src.relative_to(root)), str(dst.relative_to(root)))
            return
        except subprocess.CalledProcessError:
            # fall through to plain rename (file may not yet be tracked)
            pass
    dst.parent.mkdir(parents=True, exist_ok=True)
    os.rename(src, dst)


def _rewrite_links_and_hotspots(root: Path, old_id: str, new_id: str, skip: Path) -> tuple[int, int]:
    """Rewrite wikilinks `[[old-id]]` -> `[[new-id]]` (preserving `?` and `|kind`)
    and `cortex.hotspots[].childSceneId` references in every other note.

    Returns (notes_with_link_rewrites, notes_with_hotspot_rewrites).
    """
    # Match the old id only when it's the target portion of a wikilink. Preserve
    # the optional leading "?" and any `|kind` suffix.
    link_re = re.compile(
        r"(\[\[\??)" + re.escape(old_id) + r"((?:\|[^\]]+)?\]\])"
    )

    link_hits = 0
    hotspot_hits = 0
    for n in store.iter_notes(root):
        if n.path.resolve() == skip.resolve():
            continue
        new_body, n_subs = link_re.subn(r"\g<1>" + new_id + r"\g<2>", n.body)

        fm = n.fm
        cortex_meta = fm.get("cortex") if isinstance(fm, dict) else None
        hotspots_changed = False
        if isinstance(cortex_meta, dict):
            hotspots = cortex_meta.get("hotspots")
            if isinstance(hotspots, list):
                new_hotspots = []
                for h in hotspots:
                    if isinstance(h, dict) and h.get("childSceneId") == old_id:
                        h = dict(h)
                        h["childSceneId"] = new_id
                        # also refresh the hs-* id for consistency if it matches
                        if h.get("id") == f"hs-{old_id}":
                            h["id"] = f"hs-{new_id}"
                        hotspots_changed = True
                    new_hotspots.append(h)
                if hotspots_changed:
                    cortex_meta = dict(cortex_meta)
                    cortex_meta["hotspots"] = new_hotspots
                    fm = dict(fm)
                    fm["cortex"] = cortex_meta

        if n_subs == 0 and not hotspots_changed:
            continue

        store.write_note(store.Note(path=n.path, fm=fm, body=new_body))
        if n_subs:
            link_hits += 1
        if hotspots_changed:
            hotspot_hits += 1
    return link_hits, hotspot_hits


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    old_id = args.old_id
    note = store.find_by_id(root, old_id)
    if not note:
        raise SystemExit(f"unknown id: {old_id}")

    new_path, new_id = _resolve_target(root, note.path, args.new_target)

    if new_id == old_id and new_path == note.path:
        raise SystemExit("new id/path is identical to the old one")

    # Refuse on collision: any other note already using that id, or any file at
    # the new path.
    existing = store.find_by_id(root, new_id)
    if existing and existing.path != note.path:
        raise SystemExit(
            f"refusing: id {new_id!r} already in use by {existing.path.relative_to(root)}"
        )
    if new_path.exists() and new_path != note.path:
        raise SystemExit(f"refusing: {new_path.relative_to(root)} already exists")

    # 1. git mv (or os.rename) the file.
    _git_mv(root, note.path, new_path)

    # 2. Update frontmatter id (if present) and 3. handle the asset.
    moved = store.find_by_id(root, old_id)  # re-read from new location
    # find_by_id matches on fm id; before we update fm, the id is still old_id.
    # But the file path changed — re-read explicitly.
    text = new_path.read_text(encoding="utf-8")
    fm, body = parser.parse_note(text)

    if isinstance(fm.get("id"), str):
        fm["id"] = new_id

    # 3. Move asset and update sceneAsset frontmatter field.
    old_asset = root / "assets" / f"{old_id}.png"
    new_asset = root / "assets" / f"{new_id}.png"
    asset_moved = False
    if old_asset.exists() and old_asset != new_asset:
        if new_asset.exists():
            raise SystemExit(
                f"refusing: asset {new_asset.relative_to(root)} already exists"
            )
        if git_ops.is_repo(root):
            try:
                git_ops.run(
                    root, "mv",
                    str(old_asset.relative_to(root)),
                    str(new_asset.relative_to(root)),
                )
            except subprocess.CalledProcessError:
                new_asset.parent.mkdir(parents=True, exist_ok=True)
                os.rename(old_asset, new_asset)
        else:
            new_asset.parent.mkdir(parents=True, exist_ok=True)
            os.rename(old_asset, new_asset)
        asset_moved = True

    cortex_meta = fm.get("cortex")
    if isinstance(cortex_meta, dict):
        scene_asset = cortex_meta.get("sceneAsset")
        if isinstance(scene_asset, str) and (
            scene_asset == f"assets/{old_id}.png" or asset_moved
        ):
            cortex_meta = dict(cortex_meta)
            cortex_meta["sceneAsset"] = f"assets/{new_id}.png"
            fm["cortex"] = cortex_meta

    fm["updated"] = store.today()
    store.write_note(store.Note(path=new_path, fm=fm, body=body))

    # 4 + 5. Rewrite siblings.
    link_hits, hotspot_hits = _rewrite_links_and_hotspots(root, old_id, new_id, skip=new_path)

    # 6. Re-index.
    g = index.build(root)
    index.save(g, index.graph_path(root))

    print(f"mv: {old_id} -> {new_id}")
    print(f"  file:     {new_path.relative_to(root)}")
    if asset_moved:
        print(f"  asset:    assets/{new_id}.png")
    print(f"  rewrote:  {link_hits} note(s) with wikilinks, {hotspot_hits} note(s) with hotspots")

    # 7. Commit.
    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"mv: {old_id} -> {new_id}", author=author)
