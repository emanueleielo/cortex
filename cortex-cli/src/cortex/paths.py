"""Path resolution for the Cortex memory store.

The store lives at $CORTEX_ROOT (default $HOME/cortex). It is global,
not project-relative — `cortex` invoked from any cwd reaches the same store.
"""
from __future__ import annotations

import os
from pathlib import Path


def get_root() -> Path:
    """Resolve the Cortex memory root.

    Honors $CORTEX_ROOT, falls back to $HOME/cortex.
    Returns the absolute path; does not require the dir to exist.
    """
    env = os.environ.get("CORTEX_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return Path.home() / "cortex"


def assert_no_parent_git(root: Path) -> None:
    """Walk upward from `root.parent` to filesystem root; fail if any
    ancestor contains a `.git`. We don't want the memory store to be
    accidentally treated as a sub-tree of a larger repo.

    Note: the memory root itself may have a .git (that's the point).
    We check ancestors only.
    """
    cur = root.parent.resolve()
    fs_root = Path(cur.anchor)
    while cur != fs_root:
        if (cur / ".git").exists():
            raise SystemExit(
                f"refusing to bootstrap: ancestor {cur} contains a .git directory.\n"
                f"the memory store at {root} would become a sub-tree of that repo.\n"
                f"either remove {cur}/.git or set CORTEX_ROOT to a path outside it."
            )
        cur = cur.parent
