---
name: cortex-setup
description: "Bootstrap Cortex on a fresh machine. Trigger this skill whenever the user wants to install, set up, configure, or first-time-use Cortex / the `cortex` CLI / the Cortex memory atlas — including phrases like 'install cortex', 'set up cortex', 'cortex non funziona', 'first time using cortex', 'configura cortex', 'help me get cortex working', or when the user says they cloned the repo and want to start. Also use this when `cortex` is missing, when `~/cortex/` doesn't exist, or when the user wants to point Cortex at a remote, switch image provider, or start the React atlas. Do NOT use this for daily memory work — that's the `cortex` skill."
---

# Cortex Setup

This skill brings a fresh machine to a working Cortex install:

- the `cortex` CLI on `$PATH` (Python, via pipx),
- the Cortex agent skills (`cortex`, `cortex-setup`, `cortex-scan`) installed user-level at `~/.claude/skills/` so they're available in every Claude session, not only inside `$CORTEX_SRC`,
- an initialized memory store at `~/cortex/`,
- a chosen image provider (codex default → OpenAI fallback),
- an optional GitHub remote,
- the React atlas running locally (optional).

## Layout

The user's data lives at `~/cortex/` (configurable via `$CORTEX_ROOT`). The Cortex source repo can live anywhere the user prefers — call this path `$CORTEX_SRC`. The repo contains:

- `cortex-cli/` — Python CLI source (installed globally via pipx)
- `cortex-fe/` — React atlas front-end
- `.claude/skills/` — the `cortex`, `cortex-setup`, and `cortex-scan` agent skills. During setup these are **symlinked into `~/.claude/skills/`** so they're available in any Claude session (not only when inside `$CORTEX_SRC`). Symlinks (not copies) keep them in sync with `git pull`s in the source repo.

When you run setup, the very first thing to nail down is `$CORTEX_SRC`. Either ask the user where they have the repo, or — if they don't have it yet — agree on a path and clone it there.

## How this skill behaves

You are not an installer wizard — you are a colleague helping the user finish a setup. Read what's already in place before running anything destructive. If the user already has `cortex` on PATH and `~/cortex/` exists, do NOT re-run `cortex init` — instead, summarize the state and ask what's missing.

Before each step, check first → act second. Tell the user what you're about to do in one short sentence. Don't narrate every command.

## The setup, step by step

### 1. Verify Python and pipx

```bash
python3 --version            # need 3.10+
pipx --version 2>/dev/null || python3 -m pip install --user pipx && python3 -m pipx ensurepath
```

If pipx had to be installed, the user must restart the shell (or `source ~/.zshrc`) before pipx commands work. Tell them.

### 2. Locate or clone the Cortex source repo

Pin down `$CORTEX_SRC` — the path to the cortex source repo (containing `cortex-cli/`, `cortex-fe/`, `.claude/skills/`).

**A. Already cloned**: ask the user where it is, or look for likely locations (e.g. recent `cd` history, common `~/code` / `~/dev` / `~/Documents` parents). Confirm with `ls $CORTEX_SRC/cortex-cli/pyproject.toml`.

**B. Not yet cloned**: ask the user where they want it. Common picks: `~/code/cortex`, `~/dev/cortex`, or wherever they keep other projects. Then:

```bash
git clone <repo-url> $CORTEX_SRC      # or: gh repo clone <owner>/cortex $CORTEX_SRC
```

You need the repo URL from the user — don't guess it.

### 3. Install the `cortex` CLI globally

```bash
pipx install -e $CORTEX_SRC/cortex-cli
pipx inject cortex-cli Pillow         # required for image post-processing
```

Verify: `cortex --version` should print a number.

If `cortex: command not found` afterwards, the user needs to restart the shell or `source ~/.zshrc` (pipx puts it in `~/.local/bin` and only adds that to PATH on first install).

### 4. Install the agent skills user-level

The three skills (`cortex`, `cortex-setup`, `cortex-scan`) live at `$CORTEX_SRC/.claude/skills/`. To make them available in **every** Claude session — not only when working inside `$CORTEX_SRC` — symlink each into `~/.claude/skills/`:

```bash
mkdir -p ~/.claude/skills
for s in cortex cortex-setup cortex-scan; do
  ln -sfn "$CORTEX_SRC/.claude/skills/$s" "$HOME/.claude/skills/$s"
done
```

Symlinks (not copies) keep the user-level skills in sync with `git pull`s in the source repo automatically.

**Quick check** — all three skill files should resolve:

```bash
ls ~/.claude/skills/cortex/SKILL.md ~/.claude/skills/cortex-setup/SKILL.md ~/.claude/skills/cortex-scan/SKILL.md
```

If any is missing in `$CORTEX_SRC`, the source repo is incomplete or stale — `git pull` (or re-clone).

### 5. Initialize the memory store (or restore from remote)

```bash
cortex init
```

`cortex init` is smart: it scans every authenticated `gh` account for a private `cortex-memory` repo and, if it finds exactly one, **clones it** into `~/cortex/` instead of starting empty — so memory restores cleanly across machines. With no remote available (or no `gh`), it falls back to creating an empty store.

Outcomes:
- **Restored** (one `cortex-memory` repo found) → printed as `restored: github.com/<owner>/cortex-memory`. `origin` is already wired; step 7 can be skipped.
- **Empty init** (no remote / no gh) → classic blank store with `notes/`, `inbox/`, `daily/`, `assets/`, `.config/`, and a scoped `.git/`.
- **Ambiguous** (multiple `cortex-memory` repos) → command refuses to guess. Ask the user which account, then re-run with `cortex init --from <OWNER>`.

Flags worth knowing:
- `--no-restore` — always start empty, skip the gh probe.
- `--from <OWNER>` — clone from `github.com/<OWNER>/cortex-memory.git` directly (skips detection).
- `--no-git` — don't create the scoped git repo.

If `~/cortex/notes/` already exists, `cortex init` is a no-op and tells you to run `cortex stats`. Don't re-run it.

### 6. Pick an image provider

Default is **codex** (uses the local `codex` CLI as a pure prompt → PNG generator, sandboxed to `$CORTEX_ROOT`). Fallback is **openai** (HTTP to `images/generations`).

```bash
which codex   # if found, codex is available — keep default
```

**If `codex` is not installed** OR the user prefers OpenAI:

```bash
cortex config set image.provider openai
cortex config set image.openai.token sk-...    # ask the user for a key
# alternatively: export OPENAI_API_KEY=sk-... in their shell rc
```

If the user has neither codex nor an OpenAI key, image generation simply won't work — the rest of the CLI still does. Note this and move on; don't block setup.

The image style preset (`image.style`) is pre-configured in defaults — editorial isometric, parchment palette. Don't override unless the user asks.

### 7. (Optional) Configure a GitHub remote

**Skip this step if step 5 cloned from `cortex-memory`** — origin is already wired, verify with `cortex remote info` and move on.

Otherwise, the memory store can sync to a private GitHub repo. This step requires `gh`.

```bash
which gh && gh auth status   # is gh installed AND logged in?
```

**If `gh` is missing or unauthenticated**: skip this step. Tell the user the memory still works locally and they can run `cortex remote create` later when `gh` is set up. Do NOT try to install `gh` yourself.

**If `gh` is available**:

```bash
gh auth status                          # which accounts are authenticated?
cortex remote create --user <username>  # creates a private repo and pushes
```

If multiple `gh` accounts are authenticated, the `--user` flag is required (the CLI auto-switches gh accounts based on the remote's owner and restores the previous account afterwards — no manual `gh auth switch` needed).

Verify: `cortex remote info`.

### 8. (Optional) Start the React atlas

The visual atlas at `$CORTEX_SRC/cortex-fe/` reads the store via a Vite bridge plugin that shells out to the `cortex` CLI. The CLI ships with `atlas serve`, which auto-discovers the frontend path, runs `npm install` if needed, and starts the dev server. **You — the agent — should run this automatically, not ask the user to `cd` and `npm` by hand:**

```bash
cortex atlas serve                  # default port 5173
cortex atlas serve --port 3000      # override port (uses --strictPort)
cortex atlas serve --host 0.0.0.0   # expose on LAN
cortex atlas serve --reinstall      # force fresh `npm install`
```

How `atlas serve` finds the frontend:
1. `$CORTEX_SRC` env var, if set (expected to point at the source repo root containing `cortex-fe/`).
2. Otherwise, the package install path — works automatically when the CLI was installed editable (`pipx install -e <repo>/cortex-cli`, which is what step 3 does).

This means after a normal setup the agent can launch the UI with one command — no `cd`, no path discovery, no manual `npm`. Run `cortex atlas serve` in the background (so the dev server keeps running) and tell the user the URL.

Requires `npm` (Node.js) on PATH. If `npm` is missing, the command fails with a clear message — install Node and retry, or skip if the user only wants the CLI.

If the user only wants the CLI (no UI), skip this step.

### 9. Sanity check

```bash
cortex stats          # confirms the store is reachable
cortex config get     # confirms provider + style
cortex --help         # full command surface
```

Tell the user what's set up, what's optional and skipped, and point them at the `cortex` skill (the daily-work skill) for what to do next.

## Common pitfalls

- **`cortex: command not found` after pipx install**: the user needs to restart the shell or `source ~/.zshrc`. pipx put it in `~/.local/bin` and added that to PATH only on first install.
- **`ModuleNotFoundError: PIL`**: forgot `pipx inject cortex-cli Pillow`. Re-run.
- **`codex did not produce an image`**: the codex CLI isn't on PATH, or is on a sandboxed path. Either install codex or switch to openai (step 6).
- **`gh: multiple accounts authenticated`**: pass `--user <name>` to `cortex remote create`. The CLI handles the switch transparently.
- **`cortex atlas serve` says "cannot locate cortex-fe/"**: the CLI was installed non-editable (`pipx install` without `-e`). Either reinstall with `pipx install -e <repo>/cortex-cli`, or set `CORTEX_SRC=/path/to/cortex-repo` in the environment.
- **Multiple `cortex-memory` repos found** during step 5: stop and ask the user. Cloning the wrong one mixes a different machine's memory in.
- **Memory store at a non-default path**: set `CORTEX_ROOT=/some/other/path` in the shell environment before any `cortex` command. Persist in the shell rc if they want it permanent.

## What you do NOT do here

- Do NOT assume where `$CORTEX_SRC` is — ask the user.
- Do NOT write any notes during setup. That's the `cortex` skill's job.
- Do NOT generate images during setup — there's nothing to generate yet.
- Do NOT run `cortex init` if the store already exists.
- Do NOT install `codex` or `gh` for the user — those are out of scope; just detect them and skip cleanly when missing.
- Do NOT push to remote unless the user explicitly asked for a remote.
