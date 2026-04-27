"""Happy-path tests for `cortex mv` and `cortex rm`, plus the unknown-id
non-zero exit audit."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from cortex import parser, store
from cortex.commands import mv as cmd_mv
from cortex.commands import rm as cmd_rm
from cortex.main import main


def _write(root: Path, rel: str, fm: dict, body: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(parser.dump_note(fm, body), encoding="utf-8")
    return p


@pytest.fixture
def cortex_root(tmp_path, monkeypatch):
    root = tmp_path / "cortex"
    (root / "notes").mkdir(parents=True)
    (root / "assets").mkdir()
    monkeypatch.setenv("CORTEX_ROOT", str(root))
    return root


def test_mv_rewrites_links_and_hotspots_and_moves_asset(cortex_root):
    root = cortex_root

    # alpha — the note we'll rename
    _write(root, "notes/alpha.md", {"id": "alpha", "title": "Alpha"}, "hello\n")
    # beta — links to alpha
    _write(root, "notes/beta.md", {"id": "beta", "title": "Beta"}, "see [[alpha]] and [[?alpha|kind]]\n")
    # gamma — has a hotspot pointing at alpha
    _write(
        root,
        "notes/gamma.md",
        {
            "id": "gamma",
            "title": "Gamma",
            "cortex": {
                "sceneAsset": "assets/gamma.png",
                "hotspots": [
                    {"id": "hs-alpha", "childSceneId": "alpha", "label": "A"},
                    {"id": "hs-other", "childSceneId": "other", "label": "O"},
                ],
            },
        },
        "g\n",
    )
    # asset for alpha
    asset = root / "assets" / "alpha.png"
    asset.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)

    # rename: alpha -> alpha2 (bare slug, same folder)
    rc = main(["mv", "alpha", "alpha2", "--no-commit"])
    assert rc == 0

    assert not (root / "notes" / "alpha.md").exists()
    assert (root / "notes" / "alpha2.md").exists()
    assert not (root / "assets" / "alpha.png").exists()
    assert (root / "assets" / "alpha2.png").exists()

    # frontmatter id updated
    fm, _ = parser.parse_note((root / "notes" / "alpha2.md").read_text())
    assert fm["id"] == "alpha2"

    # beta wikilinks rewritten (preserving ? and |kind)
    beta_text = (root / "notes" / "beta.md").read_text()
    assert "[[alpha2]]" in beta_text
    assert "[[?alpha2|kind]]" in beta_text
    assert "alpha]]" not in beta_text.replace("alpha2", "X")  # crude: no dangling old

    # gamma hotspot rewritten
    fm_g, _ = parser.parse_note((root / "notes" / "gamma.md").read_text())
    hs = fm_g["cortex"]["hotspots"]
    assert hs[0]["childSceneId"] == "alpha2"
    assert hs[0]["id"] == "hs-alpha2"
    assert hs[1]["childSceneId"] == "other"  # untouched


def test_mv_refuses_collision(cortex_root):
    root = cortex_root
    _write(root, "notes/alpha.md", {"id": "alpha", "title": "A"}, "")
    _write(root, "notes/beta.md", {"id": "beta", "title": "B"}, "")
    rc = main(["mv", "alpha", "beta", "--no-commit"])
    assert rc != 0
    # alpha must still exist
    assert (root / "notes" / "alpha.md").exists()


def test_rm_happy_path(cortex_root):
    root = cortex_root
    _write(root, "notes/lonely.md", {"id": "lonely", "title": "L"}, "no incoming\n")
    asset = root / "assets" / "lonely.png"
    asset.write_bytes(b"\x89PNG\r\n\x1a\n")

    rc = main(["rm", "lonely", "--no-commit"])
    assert rc == 0
    assert not (root / "notes" / "lonely.md").exists()
    assert not asset.exists()


def test_rm_refuses_with_backlinks_unless_force(cortex_root, capsys):
    root = cortex_root
    _write(root, "notes/target.md", {"id": "target", "title": "T"}, "")
    _write(root, "notes/source.md", {"id": "source", "title": "S"}, "[[target]]\n")

    rc = main(["rm", "target", "--no-commit"])
    assert rc != 0
    assert (root / "notes" / "target.md").exists()

    rc = main(["rm", "target", "--force", "--no-commit"])
    assert rc == 0
    assert not (root / "notes" / "target.md").exists()


def test_unknown_id_exits_nonzero(cortex_root):
    """Audit: every command that resolves an id should exit non-zero on miss."""
    for cmd in (
        ["get", "no-such"],
        ["update", "no-such", "--set-title", "x", "--no-commit"],
        ["mv", "no-such", "whatever", "--no-commit"],
        ["rm", "no-such", "--no-commit"],
    ):
        rc = main(cmd)
        assert rc != 0, f"expected non-zero exit for: cortex {' '.join(cmd)}"
