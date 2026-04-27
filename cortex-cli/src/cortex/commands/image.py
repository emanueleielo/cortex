"""`cortex image gen` — orchestrate scene image generation.

Flow (provider-agnostic):
1. Find children of the target note.
2. Plan the hotspot layout (deterministic bboxes from N).
3. Build a prompt that includes per-child cardinal positions.
4. Call the provider (codex/openai) as a pure prompt → PNG generator.
5. Read PNG dimensions, write `cortex.sceneAsset`, `cortex.sceneSize`,
   `cortex.hotspots` into the parent's frontmatter.

The image model approximates positions; the bbox is exactly what we planned.
"""
from __future__ import annotations

import argparse
import struct
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from cortex import config, git_ops, image as image_lib, paths, postprocess, store
from cortex.atlas import _derive_parent_id, _first_paragraph


HOTSPOT_COLORS = ["#C9A363", "#A8C4B0", "#B8CAD6"]  # ochre, mint, dust


def _read_png_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        with open(path, "rb") as f:
            f.seek(16)
            data = f.read(8)
    except OSError:
        return None
    if len(data) != 8:
        return None
    w, h = struct.unpack(">II", data)
    return (int(w), int(h))


def _output_path(root: Path, note_id: str) -> Path:
    return root / "assets" / f"{note_id}.png"


def _children_of(root: Path, note_id: str) -> list[store.Note]:
    notes = list(store.iter_notes(root))
    notes_by_path = {n.path: n for n in notes}
    notes_root = root / "notes"
    children = [
        n for n in notes
        if _derive_parent_id(n.path, notes_root, notes_by_path) == note_id
    ]
    children.sort(key=lambda n: n.id)
    return children


def _child_summary(c: store.Note) -> dict:
    tags = c.fm.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    return {
        "id": c.id,
        "title": c.title,
        "description": (c.fm.get("description") or _first_paragraph(c.body) or ""),
        "tags": [str(t) for t in tags],
    }


def _hotspots_from_layout(children: list[store.Note], layout: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i, (child, slot) in enumerate(zip(children, layout)):
        out.append({
            "id": f"hs-{child.id}",
            "bbox": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
            "color": HOTSPOT_COLORS[i % len(HOTSPOT_COLORS)],
            "childSceneId": child.id,
            "label": child.title or child.id,
        })
    return out


def _set_in_note(
    note: store.Note,
    *,
    asset_rel: str | None = None,
    output_path: Path | None = None,
    hotspots: list[dict] | None = None,
) -> None:
    fresh = store.find_by_id(paths.get_root(), note.id) or note
    fm = dict(fresh.fm)
    cortex_meta = dict(fm.get("cortex") or {}) if isinstance(fm.get("cortex"), dict) else {}
    if asset_rel is not None:
        cortex_meta["sceneAsset"] = asset_rel
    if output_path is not None:
        dims = _read_png_dimensions(output_path)
        if dims:
            cortex_meta["sceneSize"] = {"width": dims[0], "height": dims[1]}
    if hotspots is not None:
        cortex_meta["hotspots"] = hotspots
    fm["cortex"] = cortex_meta
    fm["updated"] = store.today()
    store.write_note(store.Note(path=fresh.path, fm=fm, body=fresh.body))


def _resolve_coverage(coverage: str, note: store.Note) -> str:
    """Map `--coverage auto` to exhaustive/partial based on whether the
    parent is being incrementally repainted. Heuristic: if the note already
    has a `cortex.sceneAsset`, a previous scan already painted it and this
    run is *adding* to its breadth — protect its existing identity by
    using `partial`. Fresh parents (no sceneAsset yet) use `exhaustive`."""
    if coverage in ("exhaustive", "partial"):
        return coverage
    cortex_meta = note.fm.get("cortex") or {}
    if isinstance(cortex_meta, dict) and cortex_meta.get("sceneAsset"):
        return "partial"
    return "exhaustive"


def _generate_for(
    note: store.Note,
    *,
    provider: str,
    extra_prompt: str | None,
    set_asset: bool,
    coverage: str = "auto",
) -> Path:
    root = paths.get_root()
    output = _output_path(root, note.id)
    children = _children_of(root, note.id)
    is_parent = bool(children)

    description = note.fm.get("description") or _first_paragraph(note.body) or ""
    parent_tags = note.fm.get("tags") or []
    if not isinstance(parent_tags, list):
        parent_tags = []
    parent_tags = [str(t) for t in parent_tags]
    cortex_meta = note.fm.get("cortex") or {}
    color = (cortex_meta.get("color") if isinstance(cortex_meta, dict) else None) or ""

    if is_parent:
        actual_coverage = _resolve_coverage(coverage, note)
        layout = image_lib.plan_layout(len(children), coverage=actual_coverage)
        prompt = image_lib.build_parent_prompt(
            title=note.title,
            description=str(description),
            children=[_child_summary(c) for c in children],
            layout=layout,
            tags=parent_tags,
            color=str(color),
            extra=extra_prompt,
            coverage=actual_coverage,
        )
    else:
        actual_coverage = "exhaustive"  # not meaningful for leaves
        layout = []
        prompt = image_lib.build_leaf_prompt(
            title=note.title,
            description=str(description),
            tags=parent_tags,
            color=str(color),
            extra=extra_prompt,
        )

    cov_tag = f", {actual_coverage}" if is_parent else ""
    print(f"→ {note.id}  ({provider}, {'parent ['+str(len(children))+']' if is_parent else 'leaf'}{cov_tag}, {len(prompt)} chars)")
    t0 = time.monotonic()
    image_lib.generate(provider=provider, prompt=prompt, output=output)
    dt = time.monotonic() - t0

    # Post-process B: pad to canonical target size (letterbox cream).
    # Remap planned hotspots through the same transform so they still align
    # with the visible labeled elements after padding.
    target_w, target_h = image_lib.target_size()
    bg = config.get("image.background") or "#FAF6ED"
    planned_hotspots = _hotspots_from_layout(children, layout) if is_parent else None
    src_dims = _read_png_dimensions(output)
    (final_w, final_h), final_hotspots = postprocess.pad_to_target(
        output, target_w, target_h, bg_hex=bg, hotspots=planned_hotspots,
    )
    size_kb = output.stat().st_size / 1024 if output.exists() else 0
    pad_note = ""
    if src_dims and src_dims != (final_w, final_h):
        pad_note = f"  [padded {src_dims[0]}×{src_dims[1]} → {final_w}×{final_h}]"
    print(f"  saved: {output.relative_to(root)}  ({size_kb:.0f} KB, {dt:.1f}s){pad_note}")

    if set_asset:
        rel = f"assets/{note.id}.png"
        _set_in_note(note, asset_rel=rel, output_path=output, hotspots=final_hotspots)
        msg = f"  wired: cortex.sceneAsset = {rel}"
        if final_hotspots is not None:
            msg += f"  +  hotspots = {len(final_hotspots)}"
        print(msg)
    return output


# ─── stale detection ──────────────────────────────────────────────────────

def _is_stale(root: Path, note: store.Note) -> tuple[bool, str]:
    """A parent is stale when its hotspots no longer reflect its current
    children — either the set of IDs differs (added / removed children) or a
    child's title has drifted from the label baked into the existing hotspot
    (rename: the PNG and hotspot label both still show the old text). Also
    stale when it has children but no sceneAsset yet."""
    children = _children_of(root, note.id)
    cortex_meta = note.fm.get("cortex") or {}
    if not children:
        return False, ""
    if not cortex_meta.get("sceneAsset"):
        return True, "no sceneAsset"
    hotspots = [h for h in (cortex_meta.get("hotspots") or []) if isinstance(h, dict)]
    hotspot_ids = {h.get("childSceneId") for h in hotspots}
    children_ids = {c.id for c in children}
    if hotspot_ids != children_ids:
        added = sorted(children_ids - hotspot_ids)
        removed = sorted(hotspot_ids - children_ids)
        bits = []
        if added:
            bits.append(f"new children: {added}")
        if removed:
            bits.append(f"removed children: {removed}")
        return True, "; ".join(bits)
    # ID sets match — check for label drift (a child renamed since gen).
    label_by_id = {c.id: (c.title or c.id) for c in children}
    renames: list[str] = []
    for h in hotspots:
        cid = h.get("childSceneId")
        if cid is None:
            continue
        new_label = label_by_id.get(cid)
        old_label = h.get("label")
        if new_label is not None and new_label != old_label:
            renames.append(f"{cid}: {old_label!r} → {new_label!r}")
    if renames:
        return True, "renamed: " + ", ".join(renames)
    return False, ""


def cmd_stale(args: argparse.Namespace) -> None:
    root = paths.get_root()
    rows: list[tuple[str, str]] = []
    for n in store.iter_notes(root):
        stale, reason = _is_stale(root, n)
        if stale:
            rows.append((n.id, reason))
    if not rows:
        print("no stale scenes")
        return
    print(f"{len(rows)} stale scene(s):")
    for nid, reason in rows:
        print(f"  {nid}\t— {reason}")
    print("\nregenerate with: cortex image gen <id>  (or --all-stale)")


# ─── rewire (refresh sceneAsset+sceneSize from existing PNGs) ─────────────

def cmd_rewire(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    touched: list[str] = []
    for n in store.iter_notes(root):
        png = root / "assets" / f"{n.id}.png"
        if not png.exists():
            continue
        rel = f"assets/{n.id}.png"
        _set_in_note(n, asset_rel=rel, output_path=png)
        dims = _read_png_dimensions(png)
        suffix = f"  ({dims[0]}×{dims[1]})" if dims else ""
        print(f"  {n.id}{suffix}")
        touched.append(n.id)

    if not touched:
        print("no matching assets found")
        return
    if not args.no_commit:
        ids = ", ".join(touched)
        git_ops.commit_all(
            root,
            f"image: rewire {len(touched)} sceneAsset+sceneSize ({ids[:60]})",
            author="AI" if args.ai else "HUMAN",
        )


# ─── main gen entry ───────────────────────────────────────────────────────

def cmd_gen(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    provider = args.provider or (config.get("image.provider") or "codex")

    if args.all_missing or args.all_stale:
        targets: list[store.Note] = []
        for n in store.iter_notes(root):
            if args.all_stale:
                stale, _ = _is_stale(root, n)
                if stale:
                    targets.append(n)
                    continue
            cortex_meta = n.fm.get("cortex") or {}
            if isinstance(cortex_meta, dict) and not cortex_meta.get("sceneAsset"):
                targets.append(n)
        if not targets:
            print("no targets")
            return
        workers = max(1, int(args.workers))
        print(f"generating {len(targets)} image(s) via {provider} (workers={workers})")
        # Per-target work is independent: each writes a different PNG and a
        # different note. Provider calls are parallel-safe (codex via
        # CODEX_HOME isolation in gen_via_codex; openai is stateless HTTP).
        failures: list[tuple[str, BaseException]] = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    _generate_for, n,
                    provider=provider,
                    extra_prompt=args.prompt,
                    set_asset=not args.no_set,
                    coverage=args.coverage,
                ): n for n in targets
            }
            for fut in as_completed(futures):
                n = futures[fut]
                try:
                    fut.result()
                except BaseException as e:
                    failures.append((n.id, e))
                    print(f"  ✗ {n.id}: {e}")
        if failures:
            print(f"\n{len(failures)}/{len(targets)} failed:")
            for nid, e in failures:
                print(f"  {nid}: {e}")
        ids = ", ".join(n.id for n in targets if all(nid != n.id for nid, _ in failures))
        succeeded = len(targets) - len(failures)
        if succeeded and not args.no_commit:
            git_ops.commit_all(
                root,
                f"image: gen {succeeded} ({ids[:60]})",
                author="AI" if args.ai else "HUMAN",
            )
        return

    if not args.id:
        raise SystemExit("pass an <id>, --all-missing, or --all-stale")
    note = store.find_by_id(root, args.id)
    if not note:
        raise SystemExit(f"unknown id: {args.id}")
    _generate_for(note, provider=provider, extra_prompt=args.prompt, set_asset=not args.no_set, coverage=args.coverage)
    if not args.no_commit:
        git_ops.commit_all(
            root,
            f"image: gen {note.id}",
            author="AI" if args.ai else "HUMAN",
        )


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("image", help="Image generation pipeline")
    sp = p.add_subparsers(dest="image_cmd", required=True, metavar="SUBCOMMAND")

    g = sp.add_parser("gen", help="Generate a scene image (auto-detects parent vs leaf)")
    g.add_argument("id", nargs="?", help="Note id (omit when using --all-*)")
    g.add_argument("--prompt", help="Extra prompt text appended to the auto-derived prompt")
    g.add_argument("--provider", choices=["codex", "openai"], help="Override image.provider")
    g.add_argument("--all-missing", action="store_true", help="Generate for every note lacking sceneAsset (parallel)")
    g.add_argument("--all-stale", action="store_true", help="Regenerate every parent whose children changed, plus any note lacking sceneAsset (parallel)")
    g.add_argument("--workers", type=int, default=6, help="Parallelism cap for --all-missing / --all-stale (default 6)")
    g.add_argument(
        "--coverage",
        choices=["auto", "exhaustive", "partial"],
        default="auto",
        help=(
            "Parent scene coverage. 'exhaustive' = listed children fully describe "
            "the parent (fresh umbrellas / new roots). 'partial' = listed children "
            "are SOME of the parent's concerns; paint additional unlabeled zones "
            "for the rest (incremental scans into established multi-feature "
            "parents). 'auto' (default) = infer from cortex.sceneAsset presence: "
            "parents that already have an asset get 'partial', new ones get "
            "'exhaustive'. Only affects parent scenes; leaves ignore it."
        ),
    )
    g.add_argument("--no-set", action="store_true", help="Do not write cortex.sceneAsset/hotspots back")
    g.add_argument("--ai", action="store_true")
    g.add_argument("--no-commit", action="store_true")
    g.set_defaults(fn=cmd_gen)

    rw = sp.add_parser("rewire", help="Refresh sceneAsset+sceneSize from existing PNGs on disk")
    rw.add_argument("--ai", action="store_true")
    rw.add_argument("--no-commit", action="store_true")
    rw.set_defaults(fn=cmd_rewire)

    st = sp.add_parser("stale", help="List scenes whose children changed since last image gen")
    st.set_defaults(fn=cmd_stale)
