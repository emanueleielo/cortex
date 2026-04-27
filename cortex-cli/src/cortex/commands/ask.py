"""`cortex ask <query>` — top-3 search → merged sub-graph → render with budget.

This is the primary command an agent uses to answer "what do I know about X".
"""
from __future__ import annotations

import argparse

import networkx as nx

from cortex import index, paths, render
from cortex.commands.search import search


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("ask", help="High-level query: search → merged subgraph → render")
    p.add_argument("query")
    p.add_argument("--budget", type=int, default=2000)
    p.add_argument("--depth", type=int, default=2)
    p.add_argument("--seeds", type=int, default=3, help="How many search hits to seed the subgraph")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    hits = search(g, args.query, limit=args.seeds)
    if not hits:
        raise SystemExit(f"no match for {args.query!r}")
    seeds = [n for n, _ in hits]
    u = g.to_undirected()
    sub_nodes: set[str] = set()
    for s in seeds:
        sub_nodes |= set(nx.ego_graph(u, s, radius=args.depth).nodes)
    title = f'ask("{args.query}") — seeds: {", ".join(seeds)}'
    print(render.render_subgraph(g, sub_nodes, title=title, budget=args.budget))
