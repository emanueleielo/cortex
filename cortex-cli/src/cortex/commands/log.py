"""`cortex log` — commit history of the memory store."""
from __future__ import annotations

import argparse

from cortex import git_ops, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("log", help="Show commit history (scoped to $CORTEX_ROOT)")
    p.add_argument("-n", "--max-count", type=int, default=15, help="Max commits (default 15)")
    p.add_argument(
        "--author",
        choices=["AI", "HUMAN"],
        help="Filter by author",
    )
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not git_ops.is_repo(root):
        print(f"{root} is not a git repo")
        return
    fmt = "%h\t%an\t%s"
    cmd = ["log", f"-{args.max_count}", f"--format={fmt}"]
    if args.author:
        cmd += [f"--author={args.author}"]
    r = git_ops.run(root, *cmd, check=False)
    print(r.stdout, end="")
