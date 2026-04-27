"""`cortex remote` — manage the GitHub remote for the memory store (opt-in).

This wraps `gh` (GitHub CLI) and scopes all `git` invocations to $CORTEX_ROOT
so the wrong repo can never be touched. Repos created here are always PRIVATE
— if you want public, change visibility on github.com after the fact.

Multi-account safety: if more than one gh account is authenticated and the
user does not pass --user, the command refuses to act. Personal notes should
not be pushed to the wrong account by mistake.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess

from cortex import git_ops, paths


def _gh_auth_status() -> str:
    r = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True)
    return (r.stdout or "") + (r.stderr or "")


def list_gh_accounts() -> list[str]:
    """All authenticated gh accounts on github.com (any active state)."""
    out = _gh_auth_status()
    return re.findall(r"Logged in to \S+ account (\S+)", out)


def active_gh_account() -> str | None:
    """The gh account marked `Active account: true`, if any."""
    out = _gh_auth_status()
    blocks = re.split(r"Logged in to ", out)
    for block in blocks:
        m = re.match(r"\S+ account (\S+)", block)
        if not m:
            continue
        if "Active account: true" in block:
            return m.group(1)
    return None


def _ensure_gh() -> None:
    if shutil.which("gh") is None:
        raise SystemExit("gh CLI not installed. install: https://cli.github.com")


def _resolve_user(arg_user: str | None) -> str:
    accounts = list_gh_accounts()
    if not accounts:
        raise SystemExit("no gh account authenticated. run: gh auth login")
    if arg_user:
        if arg_user not in accounts:
            raise SystemExit(
                f"account {arg_user!r} is not authenticated.\n"
                f"available: {', '.join(accounts)}\n"
                f"log in with: gh auth login"
            )
        return arg_user
    # no --user provided
    if len(accounts) == 1:
        return accounts[0]
    active = active_gh_account()
    raise SystemExit(
        f"multiple gh accounts available: {', '.join(accounts)}\n"
        f"refusing to guess. pass --user explicitly.\n"
        f"(active is currently {active!r})"
    )


def gh_switch(user: str) -> tuple[bool, str]:
    """Run `gh auth switch -u <user>`. Returns (ok, stderr)."""
    r = subprocess.run(
        ["gh", "auth", "switch", "-u", user],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()


def cmd_create(args: argparse.Namespace) -> None:
    _ensure_gh()
    root = paths.get_root()
    if not git_ops.is_repo(root):
        raise SystemExit(f"{root} is not a git repo. run `cortex init` first.")

    r = git_ops.run(root, "remote", check=False)
    if "origin" in (r.stdout or ""):
        raise SystemExit(
            "remote 'origin' already configured.\n"
            f"remove first: git -C {root} remote remove origin"
        )

    user = _resolve_user(args.user)
    full_name = f"{user}/{args.name}"

    # gh repo create uses the active account's token. If --user differs from
    # the active account, temporarily switch and restore after.
    original = active_gh_account()
    needs_switch = original is not None and original != user
    if needs_switch:
        print(f"→ gh auth switch -u {user}  (was: {original})")
        ok, err = gh_switch(user)
        if not ok:
            raise SystemExit(f"gh auth switch failed: {err}")

    try:
        cmd = [
            "gh", "repo", "create", full_name,
            "--private",
            "--source", str(root),
            "--push",
            "--remote", "origin",
        ]
        print(f"→ {' '.join(cmd)}")
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise SystemExit(f"gh repo create failed:\n{proc.stderr or proc.stdout}")
        print(proc.stdout.strip() or f"created: {full_name} (private)")
    finally:
        if needs_switch and original:
            ok, err = gh_switch(original)
            if ok:
                print(f"→ restored active gh account: {original}")
            else:
                print(f"warning: could not restore active account to {original}: {err}", flush=True)


_REMOTE_OWNER_RE = re.compile(r"github\.com[:/]([^/]+)/")


def _remote_owner(root) -> str | None:
    """Extract owner from origin's URL, e.g. github.com/<owner>/foo.git → <owner>."""
    r = git_ops.run(root, "remote", "get-url", "origin", check=False)
    if r.returncode != 0:
        return None
    m = _REMOTE_OWNER_RE.search(r.stdout or "")
    return m.group(1) if m else None


def _git_with_owner_token(root, git_args: list[str]) -> int:
    """Run `git -C root <git_args>`, auto-switching gh active account to match
    the origin's owner if needed (so the push/pull uses that account's token).
    Restores the previous active account after.
    """
    owner = _remote_owner(root)
    accounts = list_gh_accounts() if owner else []
    original = active_gh_account() if owner else None
    needs_switch = bool(owner and owner in accounts and original and original != owner)

    if needs_switch and owner:
        print(f"→ gh auth switch -u {owner}  (was: {original})")
        ok, err = gh_switch(owner)
        if not ok:
            print(f"warning: gh auth switch failed: {err}", flush=True)
            needs_switch = False

    try:
        proc = subprocess.run(
            ["git", "-C", str(root), *git_args],
            capture_output=True,
            text=True,
        )
        print(proc.stdout, end="")
        if proc.returncode != 0:
            print(proc.stderr, end="")
        return proc.returncode
    finally:
        if needs_switch and original:
            ok, err = gh_switch(original)
            if ok:
                print(f"→ restored active gh account: {original}")
            else:
                print(f"warning: could not restore active account to {original}: {err}", flush=True)


def cmd_push(args: argparse.Namespace) -> None:
    rc = _git_with_owner_token(paths.get_root(), ["push"])
    if rc != 0:
        raise SystemExit(rc)


def cmd_pull(args: argparse.Namespace) -> None:
    rc = _git_with_owner_token(paths.get_root(), ["pull"])
    if rc != 0:
        raise SystemExit(rc)


def cmd_info(args: argparse.Namespace) -> None:
    root = paths.get_root()
    if not git_ops.is_repo(root):
        print("not a git repo")
        return
    r = git_ops.run(root, "remote", "-v", check=False)
    print(r.stdout.strip() or "(no remote configured)")


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("remote", help="Manage the GitHub remote (opt-in, gh-based)")
    sp = p.add_subparsers(dest="remote_cmd", required=True, metavar="SUBCOMMAND")

    cr = sp.add_parser("create", help="Create a private GitHub repo and push")
    cr.add_argument("--name", default="cortex-memory", help="Repo name (default: cortex-memory)")
    cr.add_argument(
        "--user",
        help="gh account username. required if multiple accounts are authenticated.",
    )
    cr.set_defaults(fn=cmd_create)

    sp.add_parser("push", help="git push (scoped to $CORTEX_ROOT)").set_defaults(fn=cmd_push)
    sp.add_parser("pull", help="git pull (scoped to $CORTEX_ROOT)").set_defaults(fn=cmd_pull)
    sp.add_parser("info", help="Show configured remote").set_defaults(fn=cmd_info)
