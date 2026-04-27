"""`cortex reset` — DESTRUCTIVE: wipe memory content or remove the store entirely.

Two modes:
- soft (default): empty `notes/`, `inbox/`, `daily/`, `assets/`, drop `.index/`,
  but keep `.config/` and the scoped git history. Records the wipe as a commit.
- `--hard`: remove `$CORTEX_ROOT` entirely. Inverse of `cortex init`.

Both modes require a typed confirmation ("reset cortex") unless `--yes` is passed.
The github remote (if configured) is never touched — delete it via gh / web UI
separately if you want a fully fresh slate.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from cortex import git_ops, paths

# ANSI codes — only when stdout is a real TTY, so logs / scripts stay clean.
_TTY = sys.stdout.isatty()
_RED_BOLD = "\033[31;1m" if _TTY else ""
_YELLOW = "\033[33m" if _TTY else ""
_RESET = "\033[0m" if _TTY else ""

CONFIRM_PHRASE = "reset cortex"
_REFUSED_PATHS = {Path("/"), Path("/Users"), Path("/home"), Path("/tmp"), Path("/var"), Path("/etc")}


def _looks_like_cortex_store(root: Path) -> bool:
    markers = (".config/config.yaml", "notes", "inbox", "daily", ".git")
    return any((root / m).exists() for m in markers)


def _refuse_unsafe(root: Path) -> None:
    if root in _REFUSED_PATHS or root == Path.home():
        raise SystemExit(f"refusing to reset a system / home directory: {root}")
    if not _looks_like_cortex_store(root):
        raise SystemExit(
            f"{root} doesn't look like a cortex store (no notes/, inbox/, .config/, or .git/).\n"
            f"set $CORTEX_ROOT to the right path or run `cortex init` first."
        )


def _count_files(d: Path, glob: str) -> int:
    return sum(1 for p in d.glob(glob) if p.is_file()) if d.exists() else 0


def cmd_reset(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not root.exists():
        print(f"{root} doesn't exist — nothing to reset.")
        return
    _refuse_unsafe(root)

    notes_n = _count_files(root / "notes", "**/*.md")
    inbox_n = _count_files(root / "inbox", "**/*.md")
    daily_n = _count_files(root / "daily", "**/*.md")
    assets_n = sum(1 for p in (root / "assets").rglob("*") if p.is_file()) if (root / "assets").exists() else 0

    print(f"{_RED_BOLD}⚠  CORTEX RESET — DESTRUCTIVE OPERATION  ⚠{_RESET}")
    print(f"{_YELLOW}Target:    {root}{_RESET}")
    if args.hard:
        print(f"{_YELLOW}Mode:      HARD — the entire directory will be removed.{_RESET}")
    else:
        print(f"{_YELLOW}Mode:      SOFT — content cleared, config and git history preserved.{_RESET}")
    print()
    print("will destroy:")
    print(f"  notes:    {notes_n}")
    print(f"  inbox:    {inbox_n}")
    print(f"  daily:    {daily_n}")
    print(f"  assets:   {assets_n}")
    if args.hard:
        print("  config:   removed (entire directory goes)")
        print("  git:      local history removed (remote on github, if any, untouched)")
    print()

    if not args.yes:
        if not sys.stdin.isatty():
            raise SystemExit("non-interactive shell — pass --yes to confirm.")
        try:
            ans = input(f"this cannot be undone. type {CONFIRM_PHRASE!r} to proceed: ")
        except EOFError:
            ans = ""
        if ans.strip().lower() != CONFIRM_PHRASE:
            raise SystemExit("aborted.")

    if args.hard:
        shutil.rmtree(root)
        print(f"removed: {root}")
        return

    # Soft reset: empty content dirs, preserve structure + config + git.
    for sub in ("notes", "inbox", "daily", "assets"):
        target = root / sub
        if not target.exists():
            continue
        for child in target.iterdir():
            if child.name == ".keep":
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        (target / ".keep").touch()

    index_dir = root / ".index"
    if index_dir.exists():
        shutil.rmtree(index_dir)
    index_dir.mkdir()

    if git_ops.is_repo(root):
        author = "AI" if args.ai else "HUMAN"
        git_ops.commit_all(root, "cortex reset", author=author)

    print(f"{_YELLOW}soft reset complete.{_RESET} config + git history preserved.")


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "reset",
        help="DESTRUCTIVE: wipe memory content (use --hard to remove $CORTEX_ROOT entirely)",
    )
    p.add_argument(
        "--hard",
        action="store_true",
        help="Remove $CORTEX_ROOT entirely (inverse of `cortex init`).",
    )
    p.add_argument(
        "--yes",
        action="store_true",
        help=f"Skip the typed confirmation (must otherwise type '{CONFIRM_PHRASE}').",
    )
    p.add_argument(
        "--ai",
        action="store_true",
        help="Mark the soft-reset commit as authored by AI (default: HUMAN).",
    )
    p.set_defaults(fn=cmd_reset)
