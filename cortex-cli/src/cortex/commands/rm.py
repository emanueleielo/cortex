"""`cortex rm <id>` — delete a note (and its scene asset, if any).

Warns about every note that linked to the deleted one (broken wikilinks are
NOT auto-rewritten — that's a deliberate choice). Refuses if there are any
incoming backlinks unless `--force` is passed.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from cortex import git_ops, index, paths, parser, store


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("rm", help="Delete a note (refuses on backlinks unless --force)")
    p.add_argument("id", help="Note id to delete")
    p.add_argument("--force", action="store_true", help="Delete even if other notes link to it")
    p.add_argument("--ai", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.set_defaults(fn=run)


def _backlinks(root: Path, target_id: str, skip: Path) -> list[str]:
    """Return ids of notes whose body wikilinks to target_id."""
    out: list[str] = []
    for n in store.iter_notes(root):
        if n.path.resolve() == skip.resolve():
            continue
        for link in parser.extract_links(n.body):
            if link.target_id == target_id:
                out.append(n.id)
                break
    return out


def _git_rm(root: Path, p: Path) -> None:
    if git_ops.is_repo(root):
        try:
            git_ops.run(root, "rm", "-f", str(p.relative_to(root)))
            return
        except subprocess.CalledProcessError:
            pass
    if p.exists():
        os.remove(p)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    note = store.find_by_id(root, args.id)
    if not note:
        raise SystemExit(f"unknown id: {args.id}")

    backlinks = _backlinks(root, args.id, skip=note.path)

    if backlinks and not args.force:
        print(f"refusing: {args.id} has {len(backlinks)} incoming backlink(s):", file=sys.stderr)
        for b in backlinks:
            print(f"  {b}", file=sys.stderr)
        print("re-run with --force to delete anyway.", file=sys.stderr)
        raise SystemExit(1)

    # 1. Remove .md.
    _git_rm(root, note.path)

    # 2. Remove asset.
    asset = root / "assets" / f"{args.id}.png"
    asset_removed = False
    if asset.exists():
        _git_rm(root, asset)
        asset_removed = True

    # 3. Warn (stderr) on every backlink, since wikilinks are now broken.
    if backlinks:
        print(f"warning: {len(backlinks)} note(s) still link to {args.id} (broken):", file=sys.stderr)
        for b in backlinks:
            print(f"  {b}", file=sys.stderr)

    # 4. Re-index.
    g = index.build(root)
    index.save(g, index.graph_path(root))

    print(f"rm: {args.id}")
    print(f"  file:  {note.path.relative_to(root)}")
    if asset_removed:
        print(f"  asset: assets/{args.id}.png")

    # 5. Commit.
    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"rm: {args.id}", author=author)
