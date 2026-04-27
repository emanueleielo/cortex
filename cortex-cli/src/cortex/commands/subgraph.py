"""`cortex subgraph <id>` — BFS sub-graph with token budget."""
from __future__ import annotations

import argparse

import networkx as nx

from cortex import index, paths, render


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("subgraph", help="Render a BFS sub-graph centered on <id>")
    p.add_argument("id")
    p.add_argument("--depth", type=int, default=2)
    p.add_argument("--budget", type=int, default=2000)
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    if args.id not in g:
        raise SystemExit(f"unknown id: {args.id}")
    sub_nodes = set(nx.ego_graph(g.to_undirected(), args.id, radius=args.depth).nodes)
    title = f"subgraph({args.id}, depth={args.depth})"
    print(render.render_subgraph(g, sub_nodes, title=title, budget=args.budget))
