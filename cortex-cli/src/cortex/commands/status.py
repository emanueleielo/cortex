"""`cortex status` — working tree status (uncommitted changes)."""
from __future__ import annotations

import argparse

from cortex import git_ops, paths


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("status", help="Show uncommitted changes in $CORTEX_ROOT")
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not git_ops.is_repo(root):
        print(f"{root} is not a git repo")
        return
    r = git_ops.run(root, "status", "-sb", check=False)
    out = (r.stdout or "").rstrip()
    if not out:
        print("clean")
    else:
        print(out)
