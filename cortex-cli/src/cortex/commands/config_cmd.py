"""`cortex config` — manage ~/cortex/.config/cortex.yaml."""
from __future__ import annotations

import argparse
import json

from cortex import config


def cmd_init(args: argparse.Namespace) -> None:
    cfg = config.load(ensure=True)  # writes defaults if missing
    print(f"config:    {config.config_path()}")
    print(f"provider:  {cfg.get('image', {}).get('provider')}")
    print(f"style:     {(cfg.get('image', {}).get('style') or '')[:80]}…")


def cmd_get(args: argparse.Namespace) -> None:
    val = config.get(args.key)
    if isinstance(val, (dict, list)):
        print(json.dumps(val, indent=2, ensure_ascii=False))
    elif val is None:
        if args.key:
            raise SystemExit(f"unset: {args.key}")
        return
    else:
        print(val)


def cmd_set(args: argparse.Namespace) -> None:
    config.set_value(args.key, args.value)
    print(f"set {args.key} = {config.get(args.key)!r}")


def cmd_path(args: argparse.Namespace) -> None:
    print(config.config_path())


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("config", help="Manage Cortex config (image provider, OpenAI token, style preset)")
    sp = p.add_subparsers(dest="config_cmd", required=True, metavar="SUBCOMMAND")

    init_p = sp.add_parser("init", help="Write default config if missing")
    init_p.set_defaults(fn=cmd_init)

    get_p = sp.add_parser("get", help="Print a config value (dotted key) or full config")
    get_p.add_argument("key", nargs="?", help="Optional key, e.g. image.provider")
    get_p.set_defaults(fn=cmd_get)

    set_p = sp.add_parser("set", help="Set a config value (dotted key)")
    set_p.add_argument("key", help="Dotted key, e.g. image.provider or image.openai.token")
    set_p.add_argument("value", help="Value (coerced: int/float/bool when obvious)")
    set_p.set_defaults(fn=cmd_set)

    sp.add_parser("path", help="Print the config file path").set_defaults(fn=cmd_path)
