"""`cortex capture <text>` — quick note in inbox/."""
from __future__ import annotations

import argparse

from cortex import git_ops, paths, parser, store


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("capture", help="Quick-capture a note into inbox/")
    p.add_argument("text", help="Free-form text. First 80 chars become the title.")
    p.add_argument("--ai", action="store_true", help="Mark commit as AI-authored")
    p.add_argument("--no-commit", action="store_true", help="Skip git auto-commit")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        raise SystemExit(f"{root} does not exist — run `cortex init` first.")

    text = args.text.strip()
    head = text.replace("\n", " ").strip()[:40]
    nid = f"{store.now_compact()}-{parser.slug(head)}".rstrip("-")

    fm = {
        "id": nid,
        "title": text.replace("\n", " ").strip()[:80],
        "created": store.today(),
        "updated": store.today(),
        "source": "experienced",
        "confidence": "low",
    }
    note = store.Note(path=root / "inbox" / f"{nid}.md", fm=fm, body=text + "\n")
    store.write_note(note)

    print(note.path.relative_to(root))

    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"capture: {fm['title'][:60]}", author=author)
