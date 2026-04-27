# Cortex source repo — agent guidance

This file is auto-loaded by Claude Code when it runs anywhere inside this repo. It captures conventions that aren't otherwise obvious from the code, plus a few rules that protect the user from leaking personal data when this repo is pushed publicly.

The user's daily-work and setup skills live at `.claude/skills/cortex/`, `.claude/skills/cortex-setup/`, and `.claude/skills/cortex-scan/` — read those when triggered. This file is for *meta* concerns that span the whole repo.

## Layout

- `cortex-cli/` — Python CLI source (installed via `pipx install -e cortex-cli`).
- `cortex-fe/` — React atlas (Vite + zustand). Started by `cortex atlas serve`.
- `.claude/skills/` — three project-scoped skills, auto-loaded with this repo.
- `.claude/settings.local.json` — gitignored per-machine permissions; **never** commit.

The user's memory store lives at `~/cortex/` (configurable via `$CORTEX_ROOT`) — entirely outside this repo. Never confuse the two.

## Hard rules

### 1. No real names in shipped artifacts
Anything that lands in git from this repo will be visible publicly. Examples:

- README, SKILL.md files, code comments, docstrings, tests, frontmatter, default values in code (e.g. zustand store seeds).
- Whenever you write or edit one of those, use **generic placeholders** (`<workspace>`, `<project>`, `<owner>`, `acme`, `octocat`, `'Friend'`) — never the user's real names, real GitHub usernames, real folder names, real URLs, or real client names.
- The single exception: paths or names the user explicitly chose to make public (the project name, public docs they authored). When in doubt, ask.

If you see a real name in an existing file, flag it before pushing.

### 2. Skills orchestrate, the CLI implements
If a skill's instructions contain bash with non-trivial logic (`for` loops, conditionals beyond simple checks, multi-step state probing), that logic probably belongs **in the CLI**. Add a subcommand or flag to `cortex-cli`, then have the skill call it once. Skills are prose for agents, not shell scripts.

### 3. Test before declaring complete
Anything you add to the CLI: at minimum, run `cortex <new-command> --help` and verify the parser is wired. For non-trivial commands, exercise one happy path. Don't claim a feature works because it parses.

### 4. Investigate anomalies; don't normalize them
If state changes you didn't change (a file reappears, a count is off, an account got switched, a pipx package re-shows up), stop and figure out who or what changed it before continuing. Carrying past unexplained state turns small mysteries into corrupt data. The `cortex` skill has a longer version of this rule.

### 5. Memory operations go through the CLI
Anything touching `~/cortex/` (or wherever `$CORTEX_ROOT` points) goes through the `cortex` CLI — never `Read` / `Write` / `cat` / raw `git`. The CLI commits, refreshes the index, and validates wikilinks; bypassing produces broken state. The `cortex` skill has the table mapping intents to commands.

## Personal data hygiene checklist (before committing changes)

```bash
grep -rni --include="*.md" --include="*.py" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=__pycache__ \
  --exclude-dir=dist --exclude-dir=.venv \
  "<known-personal-name-1>\|<known-personal-name-2>" .
```

Run before any push. If hits appear in tracked files, sanitize. `.claude/settings.local.json` matches but is gitignored — leave it.

## Useful gotchas

- The CLI is installed editable via pipx, so source changes are live without re-install. `cortex --version` confirms installation.
- The atlas Vite plugin shells out to `cortex` — meaning the CLI must be on PATH for `cortex atlas serve` to work end-to-end.
- `cortex init` auto-restores from `<owner>/cortex-memory` on github when exactly one such repo is reachable across authenticated `gh` accounts. Use `--no-restore` to force an empty init, or `--from <owner>` to disambiguate.
- `cortex reset --hard` is the inverse of `cortex init`. It does NOT touch the github remote — that has to be deleted via `gh` or the web UI.
