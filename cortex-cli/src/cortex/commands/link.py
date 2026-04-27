"""`cortex link <from> <to>` — append a wikilink to a note's body. Idempotent."""
from __future__ import annotations

import argparse
import sys

from cortex import git_ops, paths, parser, store


# Closed taxonomy of relation kinds. Source of truth lives in `parser` —
# atlas.py uses the same set to decide which `[[id|X]]` labels are real
# kinds vs. inline prose. We re-export here so `cortex link` keeps warning
# users who reach for off-set verbs.
KNOWN_KINDS = parser.KNOWN_KINDS


def render_link(target: str, *, inferred: bool = False, kind: str | None = None) -> str:
    marker = "?" if inferred else ""
    if kind:
        return f"[[{marker}{target}|{kind}]]"
    return f"[[{marker}{target}]]"


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("link", help="Append a wikilink from one note to another")
    p.add_argument("from_id", help="Source note id")
    p.add_argument("to_id", help="Target note id (will be slugified if needed)")
    p.add_argument("--inferred", action="store_true", help="Mark link as INFERRED ([[?id]])")
    p.add_argument(
        "--kind",
        help="Typed link. Recommended set: " + ", ".join(sorted(KNOWN_KINDS)),
    )
    p.add_argument("--ai", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    src = store.find_by_id(root, args.from_id)
    if not src:
        raise SystemExit(f"unknown source id: {args.from_id}")

    if args.kind and args.kind not in KNOWN_KINDS:
        # Soft warning: agents who reach for a fancy verb get redirected to
        # the closed set. We don't fail because users may have legacy notes
        # or domain-specific kinds we shouldn't reject outright.
        print(
            f"warning: --kind {args.kind!r} not in recommended set "
            f"({', '.join(sorted(KNOWN_KINDS))}). "
            "Consider collapsing into one of those before the marginalia gets crowded.",
            file=sys.stderr,
        )

    target = parser.slug(args.to_id) or args.to_id
    link_text = render_link(target, inferred=args.inferred, kind=args.kind)

    # Semantic idempotence: skip if the body already produces an edge with the
    # same (target, kind) — even if the existing wikilink is written
    # differently (e.g. `[[X]]` in prose, or `[[?X]]` from a prior inferred
    # link). Avoids the FE seeing two "X LINK" rows when the relation is
    # really one. Atlas.py also dedups at JSON-emission time, but catching it
    # here means the body itself stays clean.
    desired_kind = args.kind or "link"
    for existing in parser.extract_links(src.body):
        if existing.target_id == target and (existing.kind or "link") == desired_kind:
            print(f"already linked: {args.from_id} -> {target}")
            return

    new_body = src.body.rstrip() + "\n\n" + link_text + "\n"
    new_fm = {**src.fm, "updated": store.today()}
    store.write_note(store.Note(path=src.path, fm=new_fm, body=new_body))

    print(f"linked: {args.from_id} -> {target} {'(inferred)' if args.inferred else ''}{f' [{args.kind}]' if args.kind else ''}")

    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"link: {args.from_id} -> {target}", author=author)
