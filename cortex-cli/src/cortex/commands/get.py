"""`cortex get <id>` — full note + outgoing + backlinks."""
from __future__ import annotations

import argparse

from cortex import index, paths, parser, store


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("get", help="Print full note + outgoing links + backlinks")
    p.add_argument("id")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    note = store.find_by_id(root, args.id)
    if not note:
        raise SystemExit(f"unknown id: {args.id}")

    print(parser.dump_note(note.fm, note.body), end="")

    g = index.load(root)
    if args.id in g:
        print("\n## Outgoing")
        out_edges = sorted(g.out_edges(args.id, data=True), key=lambda e: e[1])
        if not out_edges:
            print("- (none)")
        for _, v, d in out_edges:
            kind = d.get("kind") or "link"
            conf = d.get("confidence")
            print(f"- {v} [{kind} · {conf}]")

        print("\n## Backlinks")
        in_edges = sorted(g.in_edges(args.id, data=True), key=lambda e: e[0])
        if not in_edges:
            print("- (none)")
        for u, _, d in in_edges:
            kind = d.get("kind") or "link"
            conf = d.get("confidence")
            print(f"- {u} [{kind} · {conf}]")
