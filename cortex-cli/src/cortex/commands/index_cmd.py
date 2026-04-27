"""`cortex index` — rebuild the graph cache."""
from __future__ import annotations

import argparse

from cortex import index, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("index", help="Rebuild the graph index from .md files")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    g = index.build(root)
    index.save(g, index.graph_path(root))
    n_nodes = g.number_of_nodes()
    n_edges = g.number_of_edges()
    inferred = sum(1 for _, _, d in g.edges(data=True) if d.get("confidence") == "INFERRED")
    extracted = n_edges - inferred
    print(f"indexed: {n_nodes} nodes, {n_edges} edges ({extracted} EXTRACTED, {inferred} INFERRED)")
    print(f"cached:  {index.graph_path(root).relative_to(root)}")
