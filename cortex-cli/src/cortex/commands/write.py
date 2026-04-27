"""`cortex write <path>` — create a structured note at an explicit path."""
from __future__ import annotations

import argparse
import sys

from cortex import git_ops, paths, parser, store


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("write", help="Create a structured note at a relative path under $CORTEX_ROOT")
    p.add_argument("path", help="Relative path under root, e.g. notes/learning/spaced-rep.md")
    p.add_argument("--title", required=True)
    p.add_argument("--source", default="experienced", choices=["experienced", "read", "inferred"])
    p.add_argument("--confidence", default="medium", choices=["high", "medium", "low"])
    p.add_argument("--tag", action="append", default=[], help="Tag (repeatable)")
    p.add_argument("--id", help="Explicit id (default: slug of title)")
    p.add_argument("--body-stdin", action="store_true", help="Read body from stdin")
    p.add_argument("--ai", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    target = (root / args.path).resolve()
    if root not in target.parents:
        raise SystemExit(f"path must be inside {root}")
    if target.exists():
        raise SystemExit(f"refusing to overwrite existing note: {target}")
    if target.suffix != ".md":
        raise SystemExit("path must end in .md")

    nid = args.id or parser.slug(target.stem)
    if not nid:
        raise SystemExit("could not derive id — pass --id explicitly")

    fm = {
        "id": nid,
        "title": args.title,
        "created": store.today(),
        "updated": store.today(),
        "source": args.source,
        "confidence": args.confidence,
    }
    if args.tag:
        fm["tags"] = args.tag

    body = sys.stdin.read() if args.body_stdin else ""

    note = store.Note(path=target, fm=fm, body=body)
    store.write_note(note)
    print(note.path.relative_to(root))

    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"write: {args.title[:60]}", author=author)
