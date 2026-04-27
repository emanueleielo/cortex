"""Filesystem-level operations on the Cortex memory store.

A "note" is a `.md` file under $CORTEX_ROOT (excluding `.index/`).
The note's `id` lives in the frontmatter; the file name does not need to match
(though by convention it usually does — the slug of the id).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from cortex import parser


EXCLUDED_DIRS = {".index", ".git", ".config"}


@dataclass(frozen=True)
class Note:
    path: Path           # absolute path to the .md file
    fm: dict             # frontmatter dict (may be {})
    body: str            # markdown body (without the `---` fences)

    @property
    def id(self) -> str:
        """Resolved id: frontmatter `id` field, falling back to file stem."""
        nid = self.fm.get("id")
        if isinstance(nid, str) and nid:
            return nid
        return self.path.stem

    @property
    def title(self) -> str:
        return str(self.fm.get("title") or self.id)


def iter_notes(root: Path) -> Iterator[Note]:
    """Walk all .md files under root, yielding parsed notes.

    Skips dotted ancestors (`.index/`, `.git/`, `.config/`). Malformed notes
    are surfaced (raise) — caller may catch.
    """
    for p in root.rglob("*.md"):
        if any(part in EXCLUDED_DIRS for part in p.relative_to(root).parts):
            continue
        text = p.read_text(encoding="utf-8")
        fm, body = parser.parse_note(text)
        yield Note(path=p, fm=fm, body=body)


def find_by_id(root: Path, note_id: str) -> Note | None:
    """Linear search for a note by id. O(N) — fine until we have an index cache."""
    for n in iter_notes(root):
        if n.id == note_id:
            return n
    return None


def atomic_write(path: Path, content: str) -> None:
    """Write `content` to `path` atomically (temp file in same dir + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def write_note(note: Note) -> None:
    """Render and atomically write a Note to its path."""
    text = parser.dump_note(note.fm, note.body)
    atomic_write(note.path, text)


def today() -> str:
    return datetime.now().date().isoformat()


def now_compact() -> str:
    """Compact UTC timestamp suitable for filenames: YYYY-MM-DD-HHMMSS."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
