"""Build and load the graph index over the Cortex memory store.

The graph is a NetworkX DiGraph cached at $CORTEX_ROOT/.index/graph.json.
Nodes are note ids; edges are wikilinks. Edge attributes:
- confidence: "EXTRACTED" (bare `[[id]]`) or "INFERRED" (`[[?id]]`)
- kind: optional typed-link label (`[[id|kind]]`)
"""
from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

from cortex import parser, store


def graph_path(root: Path) -> Path:
    return root / ".index" / "graph.json"


def build(root: Path) -> nx.DiGraph:
    """Walk all notes, parse, build the graph from frontmatter + wikilinks."""
    g = nx.DiGraph()
    for note in store.iter_notes(root):
        nid = note.id
        # Aggregate node attrs (last-wins on duplicates; we surface dups via stats).
        g.add_node(
            nid,
            title=note.title,
            path=str(note.path.relative_to(root)),
            source=note.fm.get("source"),
            confidence=note.fm.get("confidence"),
            tags=list(note.fm.get("tags") or []),
        )
        for link in parser.extract_links(note.body):
            edge_conf = "INFERRED" if link.inferred else "EXTRACTED"
            g.add_edge(
                nid,
                link.target_id,
                confidence=edge_conf,
                kind=link.kind,
            )
    return g


def save(g: nx.DiGraph, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = nx.node_link_data(g, edges="edges")
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def refresh(root: Path) -> nx.DiGraph:
    """Rebuild the cached graph from disk and persist it. Returns the graph."""
    g = build(root)
    save(g, graph_path(root))
    return g


def load(root: Path, *, autobuild: bool = True) -> nx.DiGraph:
    """Load the cached graph; rebuild on the fly if missing and autobuild=True."""
    p = graph_path(root)
    if not p.exists():
        if not autobuild:
            raise SystemExit(f"no index at {p} — run `cortex index` first.")
        g = build(root)
        save(g, p)
        return g
    data = json.loads(p.read_text(encoding="utf-8"))
    return nx.node_link_graph(data, edges="edges")
