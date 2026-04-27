"""`cortex backlinks <id>` — incoming links only."""
from __future__ import annotations

import argparse

from cortex import index, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("backlinks", help="Notes that link to <id>")
    p.add_argument("id")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    if args.id not in g:
        raise SystemExit(f"unknown id: {args.id}")
    rows = []
    for u in g.predecessors(args.id):
        d = g.edges[u, args.id]
        rows.append((u, d.get("kind") or "link", d.get("confidence") or "?"))
    if not rows:
        print(f"no backlinks for {args.id}")
        return
    rows.sort()
    for u, kind, conf in rows:
        print(f"{u}\t{kind}\t{conf}")
