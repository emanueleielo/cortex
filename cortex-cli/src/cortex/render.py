"""Shared rendering helpers for read commands.

The output format follows the contract documented in MEMORY.md §4:
sub-graphs are Markdown with `## Nodes`, `## Edges`, `## Stats`, `## Next hops`
sections. The contract is what makes the CLI parseable by an LLM agent.
"""
from __future__ import annotations

import networkx as nx


def fmt_node(g: nx.DiGraph, nid: str) -> str:
    """Render a single node line: `- **id** [confidence · source] — \`path\``."""
    a = g.nodes.get(nid, {})
    conf = a.get("confidence") or "?"
    src = a.get("source") or "?"
    path = a.get("path") or "(unindexed)"
    title = a.get("title") or nid
    return f"- **{nid}** [{conf} · {src}] — _{title}_ — `{path}`"


def fmt_edge(u: str, v: str, d: dict) -> str:
    """Render an edge line: `- u --kind--> v [confidence]`."""
    kind = d.get("kind") or "link"
    conf = d.get("confidence") or "?"
    arrow = f"--{kind}-->"
    return f"- {u} {arrow} {v} [{conf}]"


def render_subgraph(
    g: nx.DiGraph,
    sub_nodes: set[str],
    *,
    title: str,
    budget: int = 2000,
) -> str:
    """Render the induced subgraph on `sub_nodes` as Markdown.

    `budget` is a soft token budget — output is hard-truncated at budget*3 chars
    if needed, but we try to fit nodes/edges first. `Next hops` are nodes
    one hop outside the subgraph, ranked by inside-degree.
    """
    sub = g.subgraph(sub_nodes)
    nodes_sorted = sorted(sub.nodes, key=lambda n: -sub.degree(n))
    edges_sorted = sorted(sub.edges(data=True), key=lambda e: (e[0], e[1]))

    n_inferred = sum(1 for _, _, d in edges_sorted if d.get("confidence") == "INFERRED")
    n_extracted = len(edges_sorted) - n_inferred

    out: list[str] = []
    out.append(f"# {title}")
    out.append("")
    out.append(f"## Nodes ({len(nodes_sorted)})")
    for n in nodes_sorted:
        out.append(fmt_node(g, n))
    out.append("")
    out.append(f"## Edges ({len(edges_sorted)})")
    for u, v, d in edges_sorted:
        out.append(fmt_edge(u, v, d))
    out.append("")
    out.append("## Stats")
    out.append(f"- nodes: {len(nodes_sorted)} | edges: {len(edges_sorted)} ({n_extracted} EXTRACTED, {n_inferred} INFERRED)")
    out.append(f"- budget: {budget} chars≈tokens")

    # Next hops: nodes 1 step outside the subgraph, ranked by how many edges
    # they have into the subgraph.
    outside_score: dict[str, int] = {}
    for n in sub_nodes:
        for nbr in list(g.successors(n)) + list(g.predecessors(n)):
            if nbr in sub_nodes:
                continue
            outside_score[nbr] = outside_score.get(nbr, 0) + 1
    if outside_score:
        out.append("")
        out.append("## Next hops (not included)")
        for nbr, score in sorted(outside_score.items(), key=lambda kv: -kv[1])[:8]:
            a = g.nodes.get(nbr, {})
            conf = a.get("confidence") or "?"
            out.append(f"- {nbr} [{conf}] — connected by {score} edge(s)")

    text = "\n".join(out)
    # soft truncation
    cap = budget * 3
    if len(text) > cap:
        text = text[: cap - 30].rstrip() + "\n\n…(truncated)"
    return text
