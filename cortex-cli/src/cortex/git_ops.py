"""Git operations scoped to the Cortex root.

Every git call uses `git -C <root>` so the cwd of the caller never matters —
operations always target the memory store, never an unrelated repo.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from cortex import index

AI_NAME, AI_EMAIL = "AI", "ai@cortex.local"
HUMAN_NAME, HUMAN_EMAIL = "HUMAN", "human@cortex.local"


def is_repo(root: Path) -> bool:
    return (root / ".git").exists()


def run(root: Path, *args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    """Run `git -C <root> <args...>`."""
    cmd = ["git", "-C", str(root), *args]
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
    )


def init_repo(root: Path) -> None:
    """Initialize a git repo at root with main as default branch."""
    run(root, "init", "-b", "main")


def commit_all(root: Path, message: str, *, author: str = "HUMAN", allow_empty: bool = False) -> bool:
    """Stage everything and commit. Returns True if a commit was made.

    `author` is HUMAN or AI — sets GIT_AUTHOR_NAME/EMAIL for this commit only.
    """
    if not is_repo(root):
        return False

    run(root, "add", "-A", check=False)

    name, email = (AI_NAME, AI_EMAIL) if author == "AI" else (HUMAN_NAME, HUMAN_EMAIL)
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": name,
        "GIT_AUTHOR_EMAIL": email,
        "GIT_COMMITTER_NAME": name,
        "GIT_COMMITTER_EMAIL": email,
    }

    args = ["commit", "-m", message]
    if allow_empty:
        args.append("--allow-empty")

    result = subprocess.run(
        ["git", "-C", str(root), *args],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    # nothing-to-commit returns non-zero with "nothing to commit" — not a failure for us.
    if result.returncode != 0 and "nothing to commit" not in (result.stdout + result.stderr):
        raise SystemExit(f"git commit failed: {result.stderr.strip()}")
    committed = result.returncode == 0
    if committed:
        index.refresh(root)
    return committed
