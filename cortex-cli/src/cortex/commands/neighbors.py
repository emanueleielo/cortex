"""`cortex neighbors <id>` — direct outgoing + incoming neighbors."""
from __future__ import annotations

import argparse

from cortex import index, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("neighbors", help="Direct neighbors (out + in) with edge metadata")
    p.add_argument("id")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    if args.id not in g:
        raise SystemExit(f"unknown id: {args.id}")
    for v in g.successors(args.id):
        d = g.edges[args.id, v]
        kind = d.get("kind") or "link"
        conf = d.get("confidence")
        print(f"out\t{v}\t{kind}\t{conf}")
    for u in g.predecessors(args.id):
        d = g.edges[u, args.id]
        kind = d.get("kind") or "link"
        conf = d.get("confidence")
        print(f"in\t{u}\t{kind}\t{conf}")
