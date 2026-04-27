"""cortex — knowledge graph CLI on markdown files."""
from __future__ import annotations

import argparse
import sys

from cortex import __version__
from cortex.commands import (
    ask as cmd_ask,
    atlas as cmd_atlas,
    backlinks as cmd_backlinks,
    capture as cmd_capture,
    commit as cmd_commit,
    config_cmd as cmd_config,
    get as cmd_get,
    image as cmd_image,
    index_cmd as cmd_index,
    init as cmd_init,
    link as cmd_link,
    log as cmd_log,
    mv as cmd_mv,
    neighbors as cmd_neighbors,
    remote as cmd_remote,
    reset as cmd_reset,
    rm as cmd_rm,
    search as cmd_search,
    stats as cmd_stats,
    status as cmd_status,
    subgraph as cmd_subgraph,
    update as cmd_update,
    write as cmd_write,
)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="cortex",
        description="Knowledge graph CLI on markdown files (lives at $CORTEX_ROOT, default ~/cortex).",
    )
    p.add_argument("--version", action="version", version=f"cortex {__version__}")

    sub = p.add_subparsers(dest="cmd", required=True, metavar="COMMAND")
    cmd_init.add_parser(sub)
    cmd_capture.add_parser(sub)
    cmd_write.add_parser(sub)
    cmd_link.add_parser(sub)
    cmd_update.add_parser(sub)
    cmd_mv.add_parser(sub)
    cmd_rm.add_parser(sub)
    cmd_index.add_parser(sub)
    cmd_get.add_parser(sub)
    cmd_search.add_parser(sub)
    cmd_neighbors.add_parser(sub)
    cmd_backlinks.add_parser(sub)
    cmd_subgraph.add_parser(sub)
    cmd_ask.add_parser(sub)
    cmd_stats.add_parser(sub)
    cmd_remote.add_parser(sub)
    cmd_reset.add_parser(sub)
    cmd_atlas.add_parser(sub)
    cmd_config.add_parser(sub)
    cmd_image.add_parser(sub)
    cmd_commit.add_parser(sub)
    cmd_status.add_parser(sub)
    cmd_log.add_parser(sub)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.fn(args)
    except SystemExit as e:
        # Normalize: a string payload is an error message — print to stderr and
        # exit non-zero. An int payload is honored as-is. None → 0.
        code = e.code
        if isinstance(code, str):
            print(code, file=sys.stderr)
            return 1
        if isinstance(code, int):
            return code
        return 0
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
