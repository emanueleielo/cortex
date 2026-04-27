"""Parse Cortex notes: YAML frontmatter + Markdown body + wikilinks.

A note is plain markdown with optional YAML frontmatter delimited by `---` lines:

    ---
    id: spaced-repetition
    title: Ripetizione spaziata
    ...
    ---

    body with [[wikilinks]], [[?uncertain]], [[typed|kind]], [[?both|kind]].

Wikilink semantics:
- bare `[[id]]`            → edge confidence=EXTRACTED, kind=None
- `[[?id]]`                → edge confidence=INFERRED  (uncertain link to follow)
- `[[id|kind]]`            → typed edge (kind="kind")
- `[[?id|kind]]`           → typed + uncertain
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import yaml

# Pattern: [[ (?)? (id) ( | (kind) )? ]]
# group 1: "?" if INFERRED else ""
# group 2: id
# group 3: kind (optional)
WIKILINK_RE = re.compile(r"\[\[(\??)([^\]|]+)(?:\|([^\]]+))?\]\]")

SLUG_RE = re.compile(r"[^a-z0-9-]+")

# Closed taxonomy of relation kinds the wikilink syntax `[[id|X]]` may
# encode. Anything else after the pipe is treated as inline display text
# (e.g. `[[ciana-tools|RoutingChatModel]]` is a class name in prose, not a
# typed relation) — see `atlas.note_to_scene` for how this is enforced when
# building connectsTo. Keep in sync with `commands/link.KNOWN_KINDS`.
KNOWN_KINDS = {
    "link",
    "uses",
    "feeds",
    "part-of",
    "maintained-by",
    "promoted-to",
}


@dataclass(frozen=True)
class WikiLink:
    target: str            # raw target text from the link (pre-slug)
    target_id: str         # slugified target
    inferred: bool         # True if `?` prefix
    kind: str | None       # optional typed kind


def slug(s: str) -> str:
    """Map any string to a stable url-safe id.

    Lowercase, alphanumeric + hyphens, no leading/trailing hyphens.
    Multi-character runs of separators collapse to a single hyphen.
    """
    return SLUG_RE.sub("-", s.lower()).strip("-")


def parse_note(text: str) -> tuple[dict[str, Any], str]:
    """Split a note into (frontmatter dict, body string).

    If no frontmatter is present (no leading `---\n`), returns ({}, text).
    A malformed/unterminated frontmatter raises yaml.YAMLError.
    """
    if not text.startswith("---\n"):
        return {}, text

    # find closing `---` on its own line
    end = text.find("\n---\n", 4)
    if end == -1:
        # also accept a final `---\n` at EOF without trailing newline
        if text.rstrip().endswith("---"):
            end = text.rfind("\n---")
            fm_text = text[4:end]
            body = ""
        else:
            return {}, text  # no closing fence — treat whole thing as body
    else:
        fm_text = text[4:end]
        body = text[end + 5:]

    fm = yaml.safe_load(fm_text) or {}
    if not isinstance(fm, dict):
        raise ValueError(f"frontmatter must be a YAML mapping, got {type(fm).__name__}")
    return fm, body


def dump_note(fm: dict[str, Any], body: str) -> str:
    """Render (fm, body) back to a markdown string with `---` delimited frontmatter."""
    if not fm:
        return body
    fm_yaml = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True, default_flow_style=False)
    body_clean = body.lstrip("\n")
    return f"---\n{fm_yaml}---\n\n{body_clean}"


def extract_links(body: str) -> list[WikiLink]:
    """Extract all wikilinks from the body, preserving order and duplicates."""
    out: list[WikiLink] = []
    for m in WIKILINK_RE.finditer(body):
        marker, target, kind = m.group(1), m.group(2), m.group(3)
        target_clean = target.strip()
        out.append(
            WikiLink(
                target=target_clean,
                target_id=slug(target_clean),
                inferred=bool(marker),
                kind=kind.strip() if kind else None,
            )
        )
    return out
