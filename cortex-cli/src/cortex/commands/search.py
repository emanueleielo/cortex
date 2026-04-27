"""`cortex search <query>` — top-N nodes by simple keyword scoring."""
from __future__ import annotations

import argparse

import networkx as nx

from cortex import index, paths


def score_node(nid: str, attrs: dict, q: str) -> int:
    q = q.lower()
    s = 0
    if q in nid.lower():
        s += 3
    title = (attrs.get("title") or "").lower()
    if q in title:
        s += 3
    path = (attrs.get("path") or "").lower()
    if q in path:
        s += 1
    for t in attrs.get("tags") or []:
        if q in t.lower():
            s += 2
    return s


def search(g: nx.DiGraph, query: str, limit: int = 10) -> list[tuple[str, int]]:
    scored = [(n, score_node(n, g.nodes[n], query)) for n in g.nodes]
    scored = [(n, s) for n, s in scored if s > 0]
    scored.sort(key=lambda x: -x[1])
    return scored[:limit]


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("search", help="Search for nodes by keyword (id/title/path/tags)")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=10)
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    hits = search(g, args.query, limit=args.limit)
    if not hits:
        print(f"no match for {args.query!r}")
        return
    for nid, score in hits:
        a = g.nodes[nid]
        title = a.get("title") or nid
        conf = a.get("confidence") or "?"
        path = a.get("path") or "(unindexed)"
        print(f"{score}\t{nid}\t[{conf}]\t{title}\t{path}")
