---
name: cortex
description: "Daily memory work in Cortex via the `cortex` CLI: capturing thoughts, writing structured notes, linking concepts, generating scene images, querying the knowledge graph. Use this skill whenever the user wants to remember, capture, save, jot down, log, link, ask, search, or work with their Cortex memory store / knowledge graph / atlas — including phrases like 'remember this', 'save a note about X', 'aggiungi una memoria', 'cerca nel cortex', 'cosa so di X', 'crea una scena per X', 'aggiorna l'immagine del nodo Y', or any reference to inbox / daily / notes inside `~/cortex/`. Trigger this whenever the user mentions cortex, memory, the atlas, scenes, hotspots, or wants to record/recall information about their projects or work. NEVER read files in `~/cortex/` directly with cat/Read — always use the `cortex` CLI."
---

# Cortex — daily memory work

Cortex is the user's persistent memory: a knowledge graph of markdown notes at `~/cortex/`, a CLI that owns it (`cortex`), and a React atlas that visualizes it as a zoomable scene. You do everything through the CLI. The notes are not "files you edit" — they are records the CLI maintains, indexes, commits, and renders.

If the CLI isn't installed yet, switch to the `cortex-setup` skill first.

## The one rule

**Never read or write files inside `~/cortex/` directly.** Don't `cat`, don't `Read`, don't `ls` to inspect content, don't `Write` a markdown file by hand. Use the CLI:

| You want to                    | You run                                       |
|--------------------------------|-----------------------------------------------|
| Save a stream-of-thought       | `cortex capture "..." --ai`                   |
| Write a structured note        | `cortex write notes/<path>.md --title "..." --ai` |
| See a note's body + links      | `cortex get <id>`                             |
| Find notes about something     | `cortex search <query>`                       |
| Explore neighbors              | `cortex neighbors <id>` / `cortex backlinks <id>` |
| Render a sub-graph             | `cortex subgraph <id> --depth 2`              |
| Free-form question             | `cortex ask "..."`                            |
| Rename / move a note           | `cortex mv <old-id> <new-id-or-path>`         |
| Delete a note                  | `cortex rm <id>` (refuses if backlinks; `--force` overrides) |
| Health check                   | `cortex stats`                                |

Why: the CLI auto-commits, refreshes the index, validates wikilinks, and keeps the graph internally consistent. Bypassing it produces uncommitted drift, broken edges, and stale hotspots.

If you ever feel the need to peek at the raw markdown, that's a signal you're missing a CLI flag — ask, don't `cat`.

### How `search` and `ask` actually behave (read this — it changes how you use them)

- **`cortex search <query>`** is **ranked fulltext** over title + tags + body. Output rows are `<score>\t<id>\t[<confidence>]\t<title>\t<path>`. The score is meaningful — a hit at score 11 is a real thematic match, a hit at score 2 is usually a stray-token coincidence. **Don't treat search as a boolean** ("found / not found"). Read the scores. A useful threshold for "probably related" is roughly **≥ 3**; below that, treat as noise unless the term is rare. Multi-word queries are tokenized — `cortex search "agent middleware"` matches notes containing either word, ranked by combined relevance.
- **`cortex ask "<question>"`** is closer to literal retrieval than to semantic Q&A. It can answer `no match for '<query>'` even when relevant notes exist, if the question's surface terms don't appear in them. **Do not rely on `ask` alone to decide a topic is absent.** Always cross-check with 2-3 `cortex search` calls on the key concepts before concluding the memory has nothing on a topic.
- **`cortex search` returns IDs you can immediately use** with `get`, `neighbors`, `link`, `update`. No need to convert paths.

### Affinity sweep before writing or linking a new note

Before creating a note about something the user just told you (or before declaring "no related memory exists"), do a brief sweep so the new note doesn't land orphaned:

1. Run `cortex search` on the note's title, its main `kind`, and 2-3 top concepts/entities it mentions.
2. Skim hits with score ≥ 3 — they're candidates either to link to (`cortex link <new> <existing> --kind <...> --ai`) or to mention in the body via `[[wikilink]]`.
3. If everything comes back empty / low-score, *then* it's safe to call the topic new.

This is the difference between a memory that grows as a graph and one that grows as a pile of disconnected files. Skip the sweep only for `cortex capture` (raw inbox dumps — by definition unstructured).

## Authorship

You are an AI agent. Every state-changing command takes `--ai`:

```bash
cortex write notes/x.md --title "X" --ai
cortex link a b --ai
cortex update y --set-title "..." --ai
cortex image gen x --ai
```

This is the difference between commits authored as "AI" vs "HUMAN" — the human-vs-machine signal must be preserved. If you forget `--ai`, you're falsely claiming the user wrote it.

## How notes are organized

```
notes/
├── work.md              ← the parent
└── work/                ← children of work
    ├── acme.md
    └── acme/            ← children of acme
        ├── acme-app.md
        └── acme-ai.md
```

The convention is **sibling-named**: `notes/X.md` is the parent of every file under `notes/X/`. This is how the CLI derives parent-child relationships and how the atlas builds its scene tree. There is no `index.md` — that name is reserved.

When the user says *"add Z under Y"*, the file path is `notes/<...>/Y/Z.md` (and `Y.md` must already exist alongside the `Y/` folder).

**⚠ Filename slugs are global IDs.** Cortex resolves a note's id from the filename only, **ignoring the path**. Two notes at different paths sharing a filename (`X/config.md` and `Y/config.md`) collide silently — only one is reachable by `cortex get`, and image-gen / hotspots / wikilinks for the other break without errors. **Always pick globally-unique slugs.** For generic leaf names (`config`, `middleware`, `state`, `prompts`, `index`, `utils`, `helpers`, `notes`, `readme`) prefix with the parent root: `notes/<parent>/<parent>-config.md` → id `<parent>-config`. Before each write, run `cortex get <slug>` — if it doesn't say `unknown id`, pick a different slug. To fix a collision after the fact use `cortex mv <old> <new>` (rewrites every wikilink + hotspot pointing at it) or `cortex rm <id>`.

## Atlas placement: root scenes need a position

The React atlas only renders root scenes (those with no parent) that have a `cortex.position` field. Notes without a position exist in `~/cortex/notes/` but are silently dropped from the parchment — the user sees nothing for them. **A `cortex write` on a root note without setting position is a half-completed operation.**

`cortex.position.x` and `cortex.position.y` are normalized floats in `0..1` (left→right, top→bottom of the viewport).

**Children don't need a position.** Inside a parent's view they appear via the hotspots that `cortex image gen` writes. Setting `position` on a child is harmless but unused.

### Canonical sequence for a fresh root scene

`cortex write` doesn't accept `--set`, so chain `update` before the commit:

```bash
cortex write notes/work.md --title "Work" --no-commit --ai
cortex update work --set cortex.position.x=0.5 --set cortex.position.y=0.5 --no-commit --ai
cortex commit "memory: add work zone" --ai
```

### Picking a position when you don't know

Default to the **central safe band** `x ∈ 0.3..0.7`, `y ∈ 0.35..0.65` — outside that the parchment boundary clips zones. To avoid colliding with existing roots, peek at what's already placed:

```bash
cortex atlas view --json | jq '.scenes[] | select(.parentId == null) | {id, position}'
```

Keep at least `0.15` between centers. For 2-4 fresh roots a deterministic spread reads better than uniform random — e.g. `(0.35, 0.45)`, `(0.65, 0.45)`, `(0.5, 0.65)` with ±0.04 jitter so it doesn't look gridded.

## Capture vs write

Two ways to add information:

**`cortex capture "raw thought"`** — fast, low-ceremony. Drops a stub at `inbox/YYYY-MM-DD/<slug>.md` with the first 80 chars as the title. Use this when the user is dictating a stream-of-thought and you don't yet know where it belongs.

**`cortex write notes/<path>.md --title "..." --ai`** — structured. Use this when:
- the topic is committed to a place in the tree,
- you know the source (`--source experienced|read|inferred`) and confidence (`--confidence high|medium|low`),
- you want tags (`--tag foo --tag bar`).

Body comes from stdin: `echo "body" | cortex write ... --body-stdin --ai`.

Inbox notes can later be promoted: read with `cortex get`, decide a path, `cortex write` it there, then `cortex link <inbox-id> <new-id> --kind promoted-to --ai`.

## Linking

```bash
cortex link from_id to_id --ai                    # extracted: [[to_id]]
cortex link from_id to_id --inferred --ai         # inferred: [[?to_id]]
cortex link from_id to_id --kind uses --ai        # typed: [[to_id|uses]]
```

Use `--inferred` when the connection is your inference, not stated by the user. The atlas treats inferred edges with lower confidence visually and the user can promote them later.

**Closed kind taxonomy.** Pick from this small set — don't invent new kinds. The atlas marginalia surfaces them as small inline tags, and a sprawling vocabulary makes the UI noisy:

| `--kind`            | Use when                                                                              |
|---------------------|---------------------------------------------------------------------------------------|
| *(omit)* / `link`   | Generic untyped reference. The default — body wikilinks `[[X]]` always emit this      |
| `uses`              | Source depends on target (library, framework, SDK, tool, service)                     |
| `feeds`             | Source produces output / events / jobs consumed by target                             |
| `part-of`           | Source belongs to a larger umbrella, project, suite, or org represented by target     |
| `maintained-by`     | A person or team responsible for the source (target usually a `people/` note)         |
| `promoted-to`       | Inbox → permanent lifecycle marker. Rare; only when promoting an inbox entry          |

If the relationship feels like `mentions` / `references` / `relates-to`, that's `link`. If it feels like `dispatches-to` / `sends-events-to`, that's `feeds`. The CLI accepts any string for `--kind`, but stick to the table — `cortex link` runs idempotently per `(target, kind)` pair, and the FE merges multiple kinds for the same target into one card with inline tags. Inventing new kinds just bloats those tags.

## Updating

```bash
cortex update <id> --set-title "New Title" --ai
cortex update <id> --set-confidence high --ai
cortex update <id> --set cortex.color="#C9A363" --ai            # dotted path
cortex update <id> --set-json cortex.tags='["a","b"]' --ai      # arrays/objects
echo "new body" | cortex update <id> --body-stdin --ai
```

`--set` walks dotted paths in frontmatter; `--set-json` parses the value as JSON for arrays/objects. Don't try to hand-edit the markdown.

**Heads-up — `--set-title` on a child invalidates the parent's image.** The PNG paints the child's title as a sign / banner / plaque, and the hotspot's `label` field stores the same text. Renaming the child leaves both stale. Run `cortex image stale` after any title change; the CLI will list every parent that needs regeneration.

## Scene images and the atlas

The React atlas renders each note as a scene. The image and its hotspots are owned by frontmatter fields the CLI writes — **never edit them by hand**:

- `cortex.sceneAsset` → `assets/<id>.png`
- `cortex.sceneSize` → `{width, height}`
- `cortex.hotspots` → bbox + child reference, normalized 0..1

### Generation rule of thumb

```bash
cortex image gen <id> --ai          # one note (run inline)
cortex image stale                  # list what's stale (no side effects)
cortex image rewire --ai            # refresh sceneAsset+sceneSize from disk
```

**For multiple nodes, default to `cortex image gen --all-stale --ai`.** It's a strict superset of `--all-missing`: paints every note without `sceneAsset` (parents + leaves) AND repaints any parent whose children set changed. Fans out internally (default 6 workers, override with `--workers N`), single commit. The CLI auto-picks `--coverage partial` for parents that already had a sceneAsset (so an incremental repaint doesn't collapse the parent into the newly-added child) and `--coverage exhaustive` for fresh parents. After it finishes, run `cortex image stale` — it MUST return empty, otherwise re-run. One image → `cortex image gen <id> --ai` inline.

A scene becomes **stale** when any of these holds:

1. **Children added or removed** — hotspots' `childSceneId` set no longer matches the actual children IDs.
2. **Child renamed** — the title baked into a hotspot's `label` (and into the PNG's text) drifts from the child's current `title`. Both the painted text and the hover label are now wrong.
3. **No `sceneAsset` yet** — the parent has children but was never imaged.

`cortex image stale` reports all three. Always run it after writing children, removing them, OR running `cortex update --set-title` on a child, then regenerate the listed parents. The atlas FE shows a pulsing ochre dot on stale zones and a "+N pending" tag in the bottom card so the user can see the gap before you fix it — but the regenerator is still you, not the FE.

### How the pipeline works (so you can reason about it)

1. The CLI computes deterministic bboxes for N children (`plan_layout(N)`).
2. It builds a prompt that *includes* per-child cardinal positions ("upper-left", "right third"...) and the literal child IDs that must appear as labels.
3. It calls the provider (`codex` default, `openai` fallback) as a pure prompt → PNG generator.
4. It pads the result to 1536×1024 with cream letterbox borders and remaps the bboxes through the same transform.
5. It writes `sceneAsset`, `sceneSize`, `hotspots` back to the parent's frontmatter and commits.

Providers don't pick bboxes. The CLI does. You don't need to ask the model for hotspot coordinates — they're already planned.

### The big rule for image content (read this carefully)

When generating a scene for a **technical, abstract, or systems-y memory** (a tool, a service, a pipeline, a scheduler, a database, an integration, a CI step, an "AI ops" thing) — **do not let the image become a diagram**.

❌ Avoid:
- Schematic flowcharts with arrows and boxes.
- Dashboards full of small text, charts, gauges and tables.
- Blueprints with annotation lines and reference numbers.
- Generic "AI" iconography with floating circuit traces and brain symbols.
- Anything that requires the viewer to *read embedded text* to understand what the memory is about.

The viewer often sees the scene at a glance, zoomed out. If they can't grasp the memory's purpose without zooming in to read tiny labels, the image has failed.

✅ Instead, choose a **single concrete metaphor** — a place, a workshop, an archive — that a human would intuitively associate with what the concept *does*:

| Concept                  | Bad (diagram-y)               | Good (visually self-explanatory)                            |
|--------------------------|-------------------------------|-------------------------------------------------------------|
| A scheduler              | Clock + arrows + queue boxes  | A bell tower with hourglasses on shelves, dispatch riders   |
| A context catalog        | DB schema with rows           | A vast library hall with bound volumes and a card catalog   |
| An AI ops service        | "AI" + circuit diagrams       | A control room with operators at consoles, dispatch boards  |
| An ingestion pipeline    | Flowchart of stages           | A loading dock: crates arriving, sorters, conveyor to cellar|
| A payments system        | Boxes labeled "auth", "settle"| A counting house with ledgers, a vault door, a teller      |
| A monitoring dashboard   | Charts inside frames          | A lighthouse keeper's room, telescopes, signal lamps        |

Concrete > abstract. Verbs become professions, services become buildings, data becomes physical objects (ledgers, scrolls, crates, vials, looms). Pick one metaphor for a parent and re-use it consistently for its children — a single coherent place, not a collage.

The id text still gets rendered as a sign / plaque / banner on each labeled element (so the atlas can map clicks). But the *building or scene itself* must do the explaining. If you removed the labels, a stranger should still be able to guess what kind of thing the memory describes.

When you call `cortex image gen <id> --ai`, you can pass `--prompt "..."` to nudge the metaphor explicitly:

```bash
cortex image gen acme-scheduler --prompt \
  "Depict the scheduler as a bell tower with hourglasses on shelves and dispatch riders, NOT a flowchart or clock diagram." \
  --ai
```

When in doubt about a metaphor, ask the user before generating — image gen is slow and renders cost real time.

## Remote sync

```bash
cortex remote info                           # show remote
cortex remote create --user <gh-username>    # create private repo + push
cortex remote push                           # push commits
cortex remote pull                           # pull (fast-forward)
```

Auto-handles `gh` account switching when the remote owner differs from the active gh user; restores the previous account afterwards. If `gh` is missing, remote ops fail loudly — that's expected, it's optional.

**Auto-push after every commit.** Whenever a `cortex commit` lands (your own, or one triggered by a CLI subcommand), run `cortex remote push` automatically — no need to ask. Skip silently if `cortex remote info` says no remote is configured. If push fails (divergence, auth), surface the error to the user; never auto-force-push unless the user explicitly authorized a destructive overwrite (e.g. wiped + re-init).

## Commit / status / log

State-changing commands auto-commit. To batch:

```bash
cortex write ... --no-commit --ai
cortex link ... --no-commit --ai
cortex commit "topic: brief reason" --ai
```

Inspect:

```bash
cortex status     # uncommitted changes scoped to $CORTEX_ROOT
cortex log        # commit history scoped to $CORTEX_ROOT
```

Don't run `git` directly inside `~/cortex/`. The CLI's commit handles author tagging, scope, and the index refresh. If you find yourself wanting `git`, use `cortex commit/status/log/remote` instead.

## Wiping the memory (destructive)

There are two destructive escape hatches. Both print a big warning, list what will be deleted, and require the user to type `reset cortex` to proceed (or pass `--yes`). The github remote, if any, is **never** touched — delete it via `gh` separately if needed.

```bash
cortex reset           # SOFT — empties notes/, inbox/, daily/, assets/, drops the index;
                       # config + scoped git history are preserved (commit recorded).
cortex reset --hard    # HARD — removes $CORTEX_ROOT entirely. Inverse of `cortex init`.
```

If the user actually wants this, they need to say so. Don't propose `reset` as a fix for an editing problem — it's a "start completely over" tool, not a recovery tool. For undoing a single bad commit, `cortex log` + manual surgery is the right escalation.

**`--yes` on a populated store**: never pass `--yes` autonomously when the store has any notes / inbox / daily / asset content. Even if the user authorized "reset" earlier in the conversation, run `cortex stats` first, show the counts, and ask for a fresh in-conversation confirmation before suppressing the typed prompt. Their data lives on github only if a remote was configured AND was last pushed — assume it is not recoverable until you've checked. `--yes` is for empty stores and scripted resets, not for nuking content under verbal authorization.

## Common tasks, end-to-end

### "Remember this"
1. `cortex capture "<the user's words>" --ai` — drops it in inbox/.
2. If it deserves promotion, `cortex write notes/<path>.md --title "..." --source experienced --confidence medium --ai` and `cortex link <inbox-id> <new-id> --kind promoted-to --ai`.

### "What do I know about X?"
1. `cortex search "X"` — find candidate notes.
2. `cortex get <best-id>` — full body + links.
3. `cortex ask "X?"` — high-level merged subgraph.

### "Add a fresh root zone Y to the atlas"
1. `cortex write notes/Y.md --title "Y" --no-commit --ai`.
2. `cortex update Y --set cortex.position.x=<0..1> --set cortex.position.y=<0..1> --no-commit --ai` — required, otherwise the atlas drops it. Pick coords using the placement guidance above.
3. `cortex commit "memory: add Y zone" --ai`.
4. `cortex image gen Y --ai` — paints the scene (slow; can run in background).

### "Add a child Z to Y, and update the atlas"
1. `cortex write notes/<...>/Y/Z.md --title "Z" --ai` (the `Y/` folder must coexist with `Y.md`).
2. `cortex image stale` — Y will appear (its children set changed).
3. `cortex image gen Y --ai` — regenerates Y with Z included (single node, inline).
4. `cortex remote push` — runs automatically after the commit if origin is configured (see "Remote sync").

### "Rename a memory's title"
1. `cortex update <id> --set-title "New Title" --ai`.
2. `cortex image stale` — the parent that contains `<id>` will appear with a `renamed: <id>: 'old' → 'new'` reason.
3. `cortex image gen <parent-id> --ai` — repaints the parent so the sign/banner inside the PNG and the hotspot label both pick up the new title. The CLI auto-picks `--coverage partial` for parents that already had a sceneAsset, so the repaint adds the renamed child as one labeled landmark instead of redefining the parent around it. Multiple stale parents → `cortex image gen --all-stale --ai`.

### "Refresh frontmatter from existing PNGs"
Used after re-running images out-of-band, or when atlas can't render a scene because `sceneSize` is missing:
```bash
cortex image rewire --ai
```

### Daily journal
There's a `daily/` directory but no dedicated CLI command yet — for now, treat daily entries as ordinary notes under `notes/journal/YYYY-MM-DD.md` or `cortex capture` them and let them live in inbox.

## When state surprises you, stop and investigate

If something changes that you didn't change, that's a signal — not noise. Examples:

- `~/cortex/` reappears after you removed it.
- A note exists you didn't write (and `cortex log` doesn't show your hand).
- The active gh account is different from what you set.
- `cortex stats` shows a count you don't recognize.
- A pipx package re-appears after `pipx uninstall`.

Don't normalize the surprise ("probably an automatic something"). Stop, run `cortex log` / `cortex status` / `pipx list` / `gh auth status` / hooks inspection, and figure out who or what changed the state. Only then continue. Carrying on past unexplained state turns small mysteries into hard-to-debug data loss.

## Things to never do

- Never `cat`, `Read`, `Write`, `Edit`, or `ls -la` files inside `~/cortex/` directly. Use the CLI.
- Never forget `--ai` on a state-changing command run by you.
- Never write a root scene without setting `cortex.position` — the atlas filters rootless-position scenes silently.
- Never generate a scene image as a diagram / dashboard / schematic — re-read the metaphor rule above.
