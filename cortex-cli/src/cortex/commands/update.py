"""`cortex update <id>` — modify fields and/or body of an existing note."""
from __future__ import annotations

import argparse
import json
import sys

from cortex import git_ops, paths, store


def parse_set(expr: str) -> tuple[list[str], str]:
    """Parse `key.path=value` into (path-segments, raw-string-value)."""
    if "=" not in expr:
        raise SystemExit(f"--set expects key=value, got {expr!r}")
    key, _, value = expr.partition("=")
    return key.split("."), value


def coerce_value(raw: str):
    """Best-effort: int/float/bool, else string."""
    low = raw.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("null", "none"):
        return None
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def set_nested(d: dict, path: list[str], value) -> None:
    cur = d
    for k in path[:-1]:
        nxt = cur.get(k)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[k] = nxt
        cur = nxt
    cur[path[-1]] = value


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("update", help="Modify an existing note's frontmatter and/or body")
    p.add_argument("id", help="Note id")
    p.add_argument("--body-stdin", action="store_true", help="Replace body with stdin")
    p.add_argument("--set-confidence", choices=["high", "medium", "low"])
    p.add_argument("--set-source", choices=["experienced", "read", "inferred"])
    p.add_argument("--set-title")
    p.add_argument(
        "--set",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Set arbitrary frontmatter field (dotted path). Repeatable. e.g. --set cortex.position.x=0.42",
    )
    p.add_argument(
        "--set-json",
        action="append",
        default=[],
        metavar="KEY=JSON",
        help="Set field from JSON (for arrays/objects). e.g. --set-json cortex.hotspots='[{...}]'",
    )
    p.add_argument("--ai", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    note = store.find_by_id(root, args.id)
    if not note:
        raise SystemExit(f"unknown id: {args.id}")

    fm = dict(note.fm)
    body = note.body

    if args.body_stdin:
        body = sys.stdin.read()
    if args.set_confidence:
        fm["confidence"] = args.set_confidence
    if args.set_source:
        fm["source"] = args.set_source
    if args.set_title:
        fm["title"] = args.set_title
    for expr in args.set:
        path, raw = parse_set(expr)
        set_nested(fm, path, coerce_value(raw))
    for expr in args.set_json:
        path, raw = parse_set(expr)
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as e:
            raise SystemExit(f"--set-json: invalid JSON for {'.'.join(path)}: {e}")
        set_nested(fm, path, value)

    fm["updated"] = store.today()

    store.write_note(store.Note(path=note.path, fm=fm, body=body))
    print(f"updated: {args.id}")

    if not args.no_commit:
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, f"update: {args.id}", author=author)
