"""`cortex stats` — health metrics for the memory store."""
from __future__ import annotations

import argparse
from collections import Counter

from cortex import index, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("stats", help="Health metrics: counts, confidence breakdown, top tags")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    g = index.load(paths.get_root())
    n_nodes = g.number_of_nodes()
    n_edges = g.number_of_edges()
    inferred = sum(1 for _, _, d in g.edges(data=True) if d.get("confidence") == "INFERRED")
    extracted = n_edges - inferred

    confs = Counter(g.nodes[n].get("confidence") for n in g.nodes)
    sources = Counter(g.nodes[n].get("source") for n in g.nodes)
    tag_counter: Counter = Counter()
    for n in g.nodes:
        for t in g.nodes[n].get("tags") or []:
            tag_counter[t] += 1

    orphans = [n for n in g.nodes if g.in_degree(n) == 0 and g.out_degree(n) == 0]
    ghosts = [n for n in g.nodes if not g.nodes[n].get("path")]

    print(f"nodes:       {n_nodes}")
    print(f"edges:       {n_edges} ({extracted} EXTRACTED, {inferred} INFERRED)")
    print(f"orphans:     {len(orphans)}  (no in/out edges)")
    print(f"ghosts:      {len(ghosts)}   (linked but no .md file)")
    print(f"confidence:  " + ", ".join(f"{k}={v}" for k, v in confs.most_common()))
    print(f"source:      " + ", ".join(f"{k}={v}" for k, v in sources.most_common()))
    if tag_counter:
        top = ", ".join(f"{t}={c}" for t, c in tag_counter.most_common(10))
        print(f"top tags:    {top}")
