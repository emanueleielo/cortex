"""`cortex atlas` — Scene[] JSON view + a local dev server for the React app."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

from cortex import atlas, paths


def cmd_view(args: argparse.Namespace) -> None:
    scenes = atlas.build_scenes(paths.get_root())
    payload = {"scenes": scenes}
    if args.json:
        # compact: vite middleware will pipe this directly to the browser
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


def _frontend_dir() -> Path:
    """Locate cortex-fe/ next to the installed cortex CLI source.

    Resolution order:
    1. $CORTEX_SRC env var, expected to point at the source repo root.
    2. Package install path. With `pipx install -e <repo>/cortex-cli`, the
       cortex package lives at <repo>/cortex-cli/src/cortex/, so cortex-fe/
       sits at parents[3] of __file__.
    """
    env = os.environ.get("CORTEX_SRC")
    if env:
        candidate = Path(env).expanduser() / "cortex-fe"
        if (candidate / "package.json").exists():
            return candidate

    import cortex  # self-import to read package __file__
    here = Path(cortex.__file__).resolve()
    candidate = here.parents[3] / "cortex-fe"
    if (candidate / "package.json").exists():
        return candidate

    raise SystemExit(
        "cannot locate cortex-fe/. set CORTEX_SRC=/path/to/cortex-repo, "
        "or install the CLI editable: pipx install -e <repo>/cortex-cli"
    )


def _ensure_npm() -> str:
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("npm not found. install Node.js (https://nodejs.org) and retry.")
    return npm


def cmd_serve(args: argparse.Namespace) -> None:
    fe = _frontend_dir()
    npm = _ensure_npm()

    node_modules = fe / "node_modules"
    if args.reinstall or not node_modules.exists():
        print(f"→ npm install  (in {fe})", flush=True)
        rc = subprocess.run([npm, "install"], cwd=fe).returncode
        if rc != 0:
            raise SystemExit(rc)

    cmd = [npm, "run", "dev"]
    if args.port is not None or args.host is not None:
        cmd.append("--")
        if args.port is not None:
            cmd += ["--port", str(args.port), "--strictPort"]
        if args.host is not None:
            cmd += ["--host", args.host]

    print(f"→ {' '.join(cmd)}  (in {fe})", flush=True)
    try:
        rc = subprocess.run(cmd, cwd=fe).returncode
    except KeyboardInterrupt:
        rc = 130
    if rc != 0:
        raise SystemExit(rc)


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("atlas", help="Bridge to the Cortex React app: scenes JSON view + dev server")
    sp = p.add_subparsers(dest="atlas_cmd", required=True, metavar="SUBCOMMAND")

    view = sp.add_parser("view", help="Emit { scenes: Scene[] } as JSON for the front-end")
    view.add_argument("--json", action="store_true", help="Compact JSON (default: pretty)")
    view.set_defaults(fn=cmd_view)

    serve = sp.add_parser(
        "serve",
        help="Run the React atlas locally (auto npm install, then npm run dev)",
    )
    serve.add_argument("--port", type=int, help="Override the dev server port (default: 5173)")
    serve.add_argument("--host", help="Bind host, e.g. 0.0.0.0 to expose on LAN")
    serve.add_argument(
        "--reinstall",
        action="store_true",
        help="Force `npm install` even if node_modules/ already exists",
    )
    serve.set_defaults(fn=cmd_serve)
