"""Config file at $CORTEX_ROOT/.config/cortex.yaml — gitignored.

Reads/writes a YAML file with arbitrary nested keys. Default schema:

    image:
      provider: codex            # codex | openai
      style: |                   # default style preset prepended to prompts
        Editorial isometric illustration ...
      openai:
        token: ""                # API token (sensitive — gitignored)
        model: gpt-image-1
        size: "1024x1024"
"""
from __future__ import annotations

import stat
from pathlib import Path
from typing import Any

import yaml

from cortex import paths


DEFAULT_STYLE = (
    "Editorial isometric illustration in the style of Stephen Biesty and "
    "Maggie Appleton — hand-drawn linework, axonometric perspective, no harsh "
    "gradients, soft shadows. Palette: cream parchment #FAF6ED, ochre #C9A363, "
    "mint #A8C4B0, dust #B8CAD6, ink #1F1F1F."
)

DEFAULT_CONFIG: dict[str, Any] = {
    "image": {
        "provider": "codex",
        "style": DEFAULT_STYLE,
        "openai": {
            "token": "",
            "model": "gpt-image-1",
            "size": "1024x1024",
        },
    },
}


def config_path() -> Path:
    return paths.get_root() / ".config" / "cortex.yaml"


def load(*, ensure: bool = True) -> dict[str, Any]:
    """Load config from disk. If missing and ensure=True, write defaults first."""
    p = config_path()
    if not p.exists():
        if ensure:
            save(DEFAULT_CONFIG)
            return dict(DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)
    raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise SystemExit(f"{p} must be a YAML mapping at the top level")
    return _deep_merge(DEFAULT_CONFIG, raw)


def save(cfg: dict[str, Any]) -> None:
    """Atomically write the config and chmod 600 (token may be present)."""
    p = config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    text = yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True, default_flow_style=False)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)
    try:
        p.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass  # not all filesystems support chmod


def get(key: str | None = None) -> Any:
    cfg = load()
    if key is None:
        return cfg
    cur: Any = cfg
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def set_value(key: str, value: Any) -> None:
    cfg = load()
    parts = key.split(".")
    cur = cfg
    for p in parts[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[parts[-1]] = _coerce(value)
    save(cfg)


def _coerce(raw: str) -> Any:
    """Best-effort scalar coercion for CLI string values."""
    low = raw.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("null", "none", ""):
        return None if low != "" else ""
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursive merge: keys in override win, but base provides defaults."""
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out
