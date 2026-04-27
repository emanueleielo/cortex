"""`cortex init` — bootstrap the memory store at $CORTEX_ROOT.

If a `cortex-memory` repo already exists on any authenticated gh account, clone
it instead of creating an empty store — this lets memory restore cleanly across
machines. Use --no-restore to skip detection, or --from <OWNER> to force one.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from cortex import git_ops, paths

GITIGNORE = """\
.index/
.config/
"""

DIRS = ["inbox", "notes", "daily", "assets", ".index"]


def _is_initialized(root: Path) -> bool:
    """Already-initialized iff the canonical content layout exists."""
    return (root / "notes").exists()


def _gh_owners_with_cortex_memory() -> list[str]:
    """All authenticated gh accounts that own a `cortex-memory` repo.

    Returns [] if `gh` is missing, no account is authenticated, or none owns
    a repo by that name. May temporarily switch the active gh account while
    probing — the original active account is restored before returning.
    """
    if not shutil.which("gh"):
        return []
    # Local import: keeps the gh-related code in commands.remote.
    from cortex.commands.remote import (
        gh_switch,
        active_gh_account,
        list_gh_accounts,
    )
    accounts = list_gh_accounts()
    if not accounts:
        return []
    original = active_gh_account()
    owners: list[str] = []
    try:
        for acct in accounts:
            if active_gh_account() != acct:
                ok, _ = gh_switch(acct)
                if not ok:
                    continue
            r = subprocess.run(
                ["gh", "repo", "view", f"{acct}/cortex-memory"],
                capture_output=True,
                text=True,
            )
            if r.returncode == 0:
                owners.append(acct)
    finally:
        if original and active_gh_account() != original:
            gh_switch(original)
    return owners


def _clone_remote(root: Path, owner: str) -> None:
    """git clone github.com/<owner>/cortex-memory.git into root."""
    if root.exists() and any(root.iterdir()):
        raise SystemExit(f"{root} already exists and is not empty — refusing to clone over it.")
    url = f"https://github.com/{owner}/cortex-memory.git"
    print(f"→ git clone {url} {root}", flush=True)
    rc = subprocess.run(["git", "clone", url, str(root)]).returncode
    if rc != 0:
        raise SystemExit(rc)


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "init",
        help="Bootstrap the memory store at $CORTEX_ROOT (default ~/cortex)",
    )
    p.add_argument(
        "--no-git",
        action="store_true",
        help="Skip git init (default: initialize a scoped git repo)",
    )
    p.add_argument(
        "--no-restore",
        action="store_true",
        help="Skip auto-detect of cortex-memory on github; always start empty",
    )
    p.add_argument(
        "--from",
        dest="from_owner",
        metavar="OWNER",
        help="Clone github.com/<OWNER>/cortex-memory.git (skips auto-detect)",
    )
    p.set_defaults(fn=run)


def run(args: argparse.Namespace) -> None:
    root = paths.get_root()
    paths.assert_no_parent_git(root)

    if _is_initialized(root):
        print(f"root:       {root}")
        print("already initialized — run `cortex stats` to summarize.")
        return

    # Phase A — try to restore from a remote cortex-memory repo.
    owner = args.from_owner
    if owner is None and not args.no_restore:
        owners = _gh_owners_with_cortex_memory()
        if len(owners) == 1:
            owner = owners[0]
            print(f"[restoring memory from github.com/{owner}/cortex-memory]", flush=True)
        elif len(owners) > 1:
            raise SystemExit(
                f"multiple gh accounts own a cortex-memory repo: {', '.join(owners)}\n"
                "refusing to guess. pass --from <OWNER> or --no-restore."
            )
        # else: no remote found, fall through to empty init.

    if owner is not None:
        _clone_remote(root, owner)
        print(f"root:       {root}")
        print(f"restored:   github.com/{owner}/cortex-memory")
        print("git:        cloned (origin set)")
        return

    # Phase B — classic empty init.
    existed = root.exists()
    root.mkdir(parents=True, exist_ok=True)

    created_dirs = []
    for d in DIRS:
        p = root / d
        if not p.exists():
            p.mkdir(parents=True)
            created_dirs.append(d)
            # daily/.keep so empty dirs are tracked by git
            if d in ("inbox", "daily", "notes", "assets"):
                (p / ".keep").touch()

    gitignore = root / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(GITIGNORE)

    if not args.no_git and not git_ops.is_repo(root):
        git_ops.init_repo(root)
        git_ops.commit_all(root, "cortex genesis", author="HUMAN")
        git_status = "initialized"
    elif git_ops.is_repo(root):
        git_status = "already a repo"
    else:
        git_status = "skipped (--no-git)"

    print(f"root:       {root}")
    print(f"existed:    {'yes' if existed else 'no'}")
    print(f"created:    {', '.join(created_dirs) if created_dirs else '(nothing new)'}")
    print(f"git:        {git_status}")
