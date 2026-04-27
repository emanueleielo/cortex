"""`cortex commit` — stage all changes and commit, scoped to $CORTEX_ROOT.

Used after `cortex image gen --no-commit` (or any other `--no-commit` write)
when you want to batch a single commit instead of one-per-write.
"""
from __future__ import annotations

import argparse

from cortex import git_ops, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "commit",
        help="Stage all changes under $CORTEX_ROOT and commit",
    )
    p.add_argument("message", help="Commit message")
    p.add_argument(
        "--ai",
        action="store_true",
        help="Author as AI (default: HUMAN)",
    )
    p.add_argument(
        "--allow-empty",
        action="store_true",
        help="Allow a commit with no changes",
    )
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not git_ops.is_repo(root):
        raise SystemExit(f"{root} is not a git repo. run `cortex init` first.")
    author = "AI" if args.ai else "HUMAN"
    ok = git_ops.commit_all(root, args.message, author=author, allow_empty=args.allow_empty)
    if ok:
        print(f"committed [{author}]: {args.message}")
    else:
        print("nothing to commit")
