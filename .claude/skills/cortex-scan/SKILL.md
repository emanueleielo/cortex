---
name: cortex-scan
description: "Build a hierarchical Cortex memory of any decomposable concept the agent can reach — a folder tree, a code repo, a website, a Notion or Linear workspace, a research topic, a document, an API surface, a person's body of work, a book, a course archive, anything that has a root and meaningful sub-parts. Trigger whenever the user asks to ingest, map, memorize, scan, survey, or build a complete picture of an existing thing — phrases like 'scan this', 'mappa Y', 'crea una memoria di X', 'fai una memoria del tema Z', 'ingest the OpenAPI spec into cortex', 'memorizza questo workspace Notion', 'costruisci una memoria di questo libro / repo / tema'. Spawns recursive exploration agents (one per node) that work over whatever medium reaches the target, and writes a tree of cortex notes mirroring the concept hierarchy. Always asks up-front how deep to go and previews the tree before writing anything."
---

# Cortex Scan

This skill builds a **hierarchical Cortex memory** of any concept the agent can reach. The target is anything with a *root* and *meaningful sub-parts that themselves decompose*. The medium is whatever the agent has access to — filesystem, web, repo, MCP server, internal knowledge, document parser, API.

What unifies all targets:

1. They have a **root** the user names ("this folder", "this URL", "the topic of X").
2. They can be **decomposed** into sub-concepts, each worth its own memory.
3. Sub-concepts can themselves decompose, until you hit leaves not worth deeper attention.
4. The agent can produce, for each sub-concept, a *handle* (path, URL, query, ID) you can pass to a child agent to recurse.

That's it. The skill is medium-agnostic; the orchestrator (you) just shuffles handles between agents and writes results into Cortex.

If the `cortex` CLI isn't installed yet, switch to `cortex-setup` first.

## When to use

- The target has visible *structure*: sub-parts, sections, modules, chapters, repos, pages, sub-topics.
- The user wants **depth**, not a single thought. For a single thought, use `cortex` (`cortex capture`).
- The agent has a way to reach the target. If it can't be reached, stop and ask before guessing.

## Reach modes (non-exhaustive)

The skill works over any of these — and combinations:

| Target shape                    | How the agent reaches it                                |
|---------------------------------|---------------------------------------------------------|
| Local folder tree               | Read / Glob / Grep / LS                                 |
| Code repo on disk               | Same as folder + git log + manifests                    |
| Public website                  | WebFetch / WebSearch                                    |
| GitHub user / org / repo (API)  | gh CLI or WebFetch                                      |
| Notion / Linear / Drive / Slack | MCP tools, when authenticated                            |
| Document (PDF, docx)            | Read tool (PDFs supported)                              |
| Research topic / question       | WebSearch + WebFetch + the agent's own knowledge        |
| API surface (OpenAPI etc.)      | Read the spec or fetch the URL                          |
| Person's body of work           | A mix: WebSearch, repos, links, docs                    |
| Course / book / archive         | Folder + per-chapter doc reads                          |

A "handle" is whatever the orchestrator can hand a child agent so the child can re-explore one level down. Handles can be heterogeneous: a parent folder may have one child that's a sub-folder, another that's a URL, another that's a Notion page ID.

## How Cortex memory mirrors the concept tree

Cortex notes encode parent-child via filesystem layout: `notes/X/Y.md` is a child of `notes/X.md`. The mapping from concept tree to Cortex tree is **conceptual, not literal** — the agent decides which sub-concepts deserve a note, and the orchestrator picks ID slugs that make sense alongside the user's existing memory.

**⚠ Globally-unique slugs are mandatory.** Cortex's id is the **filename slug only**, ignoring the path. Two notes at different paths sharing a filename (`<root-A>/config.md` and `<root-B>/config.md`) collide — only one is reachable, image-gen, hotspots, and cross-links break silently. **Always prefix leaf slugs with the project root** (or another disambiguator) when the leaf name is generic (`config`, `middleware`, `state`, `prompts`, `index`, `utils`, `helpers`, …). Example: `notes/work/<root>/<root>-config.md` rather than `notes/work/<root>/config.md`. Before writing, run `cortex search <slug>` and `cortex get <slug>` — if it resolves to anything, prefix the new one.

```
concept                                cortex memory
<root concept>                     →   notes/<umbrella>/<root>.md
  ├── <sub-concept-A>              →   notes/<umbrella>/<root>/<sub-A>.md
  │     ├── <leaf-1>               →   notes/<umbrella>/<root>/<sub-A>/<leaf-1>.md
  │     └── <leaf-2>               →   notes/<umbrella>/<root>/<sub-A>/<leaf-2>.md
  └── <sub-concept-B>              →   notes/<umbrella>/<root>/<sub-B>.md
```

`<umbrella>` is the existing parent in cortex memory (e.g. `work`, `clients`, `research`, `archive`); `<root>` is the target the user named.

## How this skill behaves

You are a careful cartographer, not a note-spammer. Read before writing. Ask depth before spawning. Preview the tree before committing notes. An empty placeholder note ("this is a folder", "this is a page") is worse than no note.

**Don't pile up yes/no questions.** The user shouldn't be asked about boundaries, cross-link policy, or scene image generation — those have baked-in defaults below. The only thing worth asking up-front is *placement* (where the new tree hangs) and *depth* (how far to dig). Everything else is decided by these rules unless the user pushes back.

**Depth = layers, breadth = exhaustive.** The depth the user picks selects how many *layers* the scan descends — never how many *notes* it produces. At every chosen layer, every meaningful sub-concept that survives the ignore list gets its own note. If a repo has 12 top-level packages and the user picked "root + top-level", the result is 13 notes (1 root + 12 packages), not "≈ 4 representative ones". Note counts are *consequences* of the structure that's actually there, not targets to hit. Curating down to a tidy number — picking 3 "main" packages out of 12, summarizing 5 "key" papers out of 20 — defeats the purpose: the user wants memory of what *is*, not what you found photogenic. Same rule applies to fields inside each note (entities, people, artifacts): list every one the agent surfaced, not a representative subset.

Before each step: **check first → act second**. One short sentence per status update.

## Built-in defaults — apply without asking

### Ignore list (skip — don't make a note for these)

A gitignore-equivalent for memory. Anything matching these is silently skipped at every level of the scan, even if the user "pointed at" the parent that contains them.

- **Build / cache**: `dist/`, `build/`, `out/`, `target/`, `.next/`, `tmp/`, `coverage/`, `.cache/`
- **Dependencies**: `node_modules/`, `vendor/`, `.venv/`, `venv/`, `__pycache__/`, `.tox/`, `.gradle/`
- **VCS / IDE / OS**: `.git/`, `.svn/`, `.idea/`, `.vscode/`, `.DS_Store`, `Thumbs.db`
- **Tests / fixtures**: `tests/`, `test/`, `__tests__/`, `spec/`, `fixtures/` — mention in the parent's body if relevant, but no separate notes
- **Examples / samples**: `examples/`, `samples/`, `demos/` — one summary note for the whole dir, never one per example
- **Generated artifacts**: lockfiles (`*.lock`, `package-lock.json`, `yarn.lock`, `Pipfile.lock`), generated SDKs (`gen/`, `*_pb.go`, OpenAPI client output)
- **Vendored / mirrored / forked content**: anything labeled `vendor/`, `third_party/`, `external/`, `forks/`
- **Hidden files**: `.*` (dotfiles) — except meaningful ones the user explicitly cares about (`.github/workflows/`, `.claude/skills/`, env templates, etc. — judgment call)

If the user explicitly names one of these as the scan target, of course scan it — but don't auto-recurse into them when scanning a parent.

### Cross-link policy (do automatically — three passes, not just entity match)

`cortex search` is **ranked fulltext** (scores by title + tags + body, not exact ID). Treating it as boolean exact-match throws away most of the signal. Linking is a three-pass sweep, all run before the preview, with results surfaced as **candidates** the user trims.

**Closed kind taxonomy (do not invent new kinds).** Pick from `{link, uses, feeds, part-of, maintained-by, promoted-to}` — the **`cortex` skill's "Linking" section** has the full table and disambiguators. Short cheatsheet for scan output: `uses` for tools/libs/SDKs, `maintained-by` for people, `part-of` for the umbrella, `feeds` for data/event flow, `link` (default) for everything else.

**Pass 1 — Entity match (literal).**
For every name in each agent's `entities` / `people`, run `cortex search "<name>"`. If a hit's ID matches the entity (case-insensitive / slug-equivalent), it's a strong candidate. Pick the kind from the table above:
- `uses` — tool / library / framework / SDK / service
- `maintained-by` — person (author, CODEOWNERS, project lead)
- `part-of` — larger umbrella the new thing belongs to
- `feeds` — produces output consumed by the existing node
- `link` — anything else (default)

**Pass 2 — Thematic sweep (ranked, not exact).**
For each new node, build 3-6 short queries from its `kind` + top entities + headline concept (e.g. for a Python middleware: `"middleware"`, `"langchain"`, `"context compaction"`, `"agent loop"`). Run `cortex search` on each. Any hit with **score ≥ 3** not already covered by Pass 1 becomes a thematic candidate, with the matched query attached as provenance and `--kind link` as default. The user decides if the affinity is real.

**Pass 3 — `cortex ask` probe.**
Run one `cortex ask "<short question grounded in the new node>"` per scanned root (e.g. *"What notes relate to LLM agent middleware and context compaction?"*). New IDs returned → low-confidence candidates with `--kind link`. If `ask` returns "no match" (it's literal-ish, not fully semantic), skip silently.

**Never invent a target.** Only link to IDs the searches actually returned. Fuzzy typos still don't count.

### Recurring-entity stub proposal

After all agents report, collect entities (excluding people) appearing in **≥ 2 different new nodes** AND with no existing note (no Pass-1 hit). These are strong candidates for a one-line stub note future scans can link to. Surface them in the preview as a separate section:

```
recurring entities not yet in memory (would propose as stubs):
  tools/langchain    [seen in: advisor-middleware, compact-middleware] (uses)
  tools/deepagents   [seen in: advisor-middleware, compact-middleware] (uses)
```

The user opts in per-stub. For accepted stubs, write a one-line note via `cortex write notes/tools/<slug>.md --title "<Name>" --source inferred --confidence low --tag tool --no-commit --ai` (creating the `tools/` umbrella with a position if needed) **before** writing the scanned tree, so scanned nodes can link to them in the same batch.

### Showing candidates in the preview

In the preview tree (step 6), every candidate appears with score and provenance:

```
cross-links proposed (N):
  <root>/<sub-A> → tools/langchain           [pass1 entity-match]                  uses
  <root>/<sub-A> → research/agent-frameworks [pass2 thematic, score 7, q:"agent loop"] link
  <root>/<sub-B> → tools/anthropic           [pass3 cortex ask]                    link
```

User trims by reply ("drop the thematic ones", "keep only entity-match"). Don't ask up-front about enabling cross-linking — the three passes always run.

### Scene image policy (do automatically at the end)

After the tree is committed, run **`cortex image gen --all-stale --ai`**. That single command:
- paints every brand-new node (parents + leaves) the scan just created (default `--coverage exhaustive`),
- repaints any pre-existing parent whose children set just changed because this scan attached a sub-tree under it (e.g. an existing project root, an umbrella like `tools/`) — the CLI auto-picks `--coverage partial` for these so the parent's broader identity stays visible instead of collapsing into the single new feature.

`--all-stale` is a strict superset of `--all-missing`: use it by default for every scan. Parallel internally (default 6 workers, override with `--workers N`), single commit.

**Verify before declaring done.** Run `cortex image stale` once the command finishes — it MUST return empty. A partial failure (API throttle, generator crash) leaves stale entries that no future scan will discover; re-run `--all-stale` until the list is empty.

Surface a question to the user only when the affected count is very large (>30 nodes) — image gen is 30-220s per scene and burns API credits, so warn once before kicking off. Don't ask per-node.

## The scan, step by step

### 1. Resolve the target — and how to reach it

Two things to pin down:

1. **The root** — what is the user pointing at? Could be a name, a path, a URL, a topic.
2. **The reach mode** — how the agent will read it (see table above). If multiple modes apply, pick the most authoritative for THIS scan and note alternatives.

The boundary is mostly already decided by the built-in ignore list above. Only ask about scope if the user's target is genuinely ambiguous (e.g. "research X" — does that mean "everything I've ever read about X" or "the specific paper Y"?). Otherwise: assume the standard ignore list, scan, and let the user trim in the preview.

### 2. Place the root in the existing memory

The new tree needs a parent in Cortex. Probe what's already there:

```bash
cortex search "<umbrella concept the target probably belongs to>"
```

Common umbrellas (only suggestions; let the user pick):
- Software / day-job / org → `work` / `<company>` / `team`
- Personal initiatives → `personal` / `projects`
- Client / partner folders → `clients` / `<client>`
- Research / archive / reading → `research` / `archive` / `reading`
- People → `people` / `network`
- Tools / tech / external systems → `tools` / `tech`

If a parent already exists, the new root sits at `notes/<parent>/<target>.md`. If not, ask the user: top-level (`notes/<target>.md`) or under a new umbrella (which they name)?

If the umbrella note doesn't exist, create it first with a one-line body.

**Atlas visibility heads-up.** Any note created at the top level (`notes/X.md` with no parent above it) is a *root scene* in the atlas, and the FE filters out root scenes that lack `cortex.position`. So if step 7 ends up creating a new umbrella OR the user picked top-level for the target, you must also set `cortex.position.x` and `cortex.position.y` (normalized 0..1) before commit — see the `cortex` skill's "Atlas placement" section. Sub-concepts under the umbrella don't need a position; they appear via the parent's hotspots after `cortex image gen`.

### 3. Pick the depth — and warn about fan-out

Internally the skill thinks in 4 depth levels:

- **L1** — root only (1 note).
- **L2** — root + its direct sub-concepts.
- **L3** — L2 + grand-children (each direct sub-concept is itself broken down).
- **L4** — L3 + leaves (atomic units inside each grand-child — use sparingly).

Levels are about **conceptual depth**, not directory depth. For a repo L2 might be top-level packages and L3 modules inside packages. For a research topic L2 might be the main schools / threads and L3 specific papers within each.

**When you ask the user, never say "L1 / L2 / L3 / L4".** That's the skill's internal vocabulary, not theirs. Translate into a concrete prompt grounded in their target, with real names and real fan-out numbers.

**Phrase each depth as "every X at this layer", not as a note count.** The user picks layers; the count is a consequence. Before asking, do one quick recon pass on the target (`ls`, `cortex search`, a single WebFetch — whatever the medium needs) to enumerate the actual top-level units, so your numbers reflect what's truly there. The estimate after each option is "this is what the structure shows", not "this is the cap".

Examples:

- For a code repo (after `ls` shows 3 top-level packages, ~12 modules total):
  > How deep should I go?
  > • Just an overview of the whole repo (1 note)
  > • Plus **every** top-level package — `cortex-cli`, `cortex-fe`, `skills` (3 of them → 4 notes total)
  > • Plus **every** module inside every package — `commands/`, `stores/`, `utils/`, … (~12 modules → ~16 notes, ~4 min)
  > • Plus **every** meaningful file inside every module (~30+ files → ~45 notes, ~12 min — slow, ask before)

- For a research topic (after a quick recon, you know there are ~5 schools):
  > • One summary of the topic (1 note)
  > • Plus **every** main school / thread — `<school-A>`, `<school-B>`, … (5 schools → 6 notes total)
  > • Plus **every** key paper / argument per school (~15 papers → ~21 notes)
  > • Plus individual concepts within papers (slow, ask before)

Note the wording: **"every X"**, not "its X" or "the main X". The number is the count *you observed*, not a target you'll hit. If recon shows 12 packages, the option says "12 of them → 13 notes total", not "≈ 4 representative ones".

After they pick, internally treat their choice as L1 / L2 / L3 / L4 and use that label only in your own log lines and prompts to subagents.

Don't bundle other questions here. Cross-links and image generation are governed by the built-in defaults above — the user trims them in the preview (step 6) if they want, not before.

### 4. Smoke test — single-agent dry-run before fan-out

Before spawning the full fleet, **run one agent on the smallest reachable child** (or on the root itself if L1) and verify the report:

- The YAML parses cleanly with the keys you expect.
- `children` is well-formed: each entry has both `handle` and `handle_type`.
- `confidence` is one of `high|medium|low`.
- The agent did NOT recurse on its own (no nested children-of-children).

If anything is malformed — keys missing, free-form prose instead of YAML, the agent returned a flat list with no handles — **stop, fix the prompt, and re-run the smoke test before fanning out**. A bad prompt scaled across 50 agents produces 50 broken reports.

Cost: one agent run. Saves: the rest of the fan-out when the prompt has a bug.

### 5. Discovery phase — recursive agent fan-out

For each node at each chosen depth, spawn an exploration agent. Pick the subagent_type by what the agent will need:
- File / repo work → `Explore` (read-only, tuned for codebases and folders).
- Web / mixed / topic → `general-purpose` (has WebFetch, WebSearch, etc.).

Run siblings **in parallel** in a single tool message — but cap at ~10 concurrent agents. For larger trees, batch level by level (root → children → grand-children).

Each agent gets a tight, **medium-aware** prompt. The skeleton is universal; the specifics adapt to the handle type.

> Explore the concept reachable via this handle: `<HANDLE>` (type: `<HANDLE_TYPE>` — one of: filesystem-path, url, github-repo, notion-page, mcp-query, research-topic, document, api-spec, other). Stay at this level — do **not** recurse into children yourself; just identify them.
>
> Use only tools needed for the handle type. **Be exhaustive at this layer** — the user picks how many *layers* to descend, but each note must be a real briefing that stands on its own (~400-600 words when the concept warrants it). Don't truncate to a tidy summary.
>
> For code repos / filesystem paths: run `git log --format='%an' | sort | uniq -c | sort -rn | head -15` to get **real top contributors by commit count** — do NOT settle for CODEOWNERS or `package.json` author fields, those miss heavy committers. Read the full README, plus any `CLAUDE.md` / `ARCHITECTURE.md` / `docs/`. Inspect package manifests, lockfiles, Dockerfiles, terraform, CI configs to ground the tech list. Capture: purpose, architecture pattern, key entry points, known gotchas, deployment target, runtime dependencies, last-activity date.
>
> Return YAML with exactly these keys (leave a key empty if you genuinely cannot determine it — never invent):
>
> ```yaml
> what: <one sentence — what this concept IS>
> why: <one to three sentences — why it exists, what it's for, what problem it addresses>
> kind: <free-form noun for the concept type — e.g. project, sub-project, module, page, paper, archive, dataset, person, tool, integration, chapter, endpoint, ...>
> confidence: <high | medium | low — your honest read on how well you understood this>
> children:                          # sub-concepts that themselves deserve a note
>   - handle: <path | url | id | search-query — usable by another agent to recurse>
>     handle_type: <filesystem-path | url | github-repo | notion-page | mcp-query | research-topic | document | api-spec | other>
>     name: <short label>
>     why_worth_noting: <one phrase>
> entities: [<names a person would reference when discussing this — clients, services, components, partners, tools, datasets, papers, people, places>]
> people: [<names from CODEOWNERS, manifests, file metadata, prose mentions, page authors>]
> top_contributors_by_commit: [<for code repos: "<name> (<commit_count>)" entries from `git log` — at least the top 5-10>]
> artifacts: [<concrete things present — languages, frameworks, file formats, chapter count, page count, citation count, model names>]
> last_activity: <YYYY-MM-DD or unknown>
> notes_for_human: <anything notable that doesn't fit above — under 30 words>
> ```
>
> **Be exhaustive.** List **every** child that survives the skip filter — not a representative subset, not "the main 3", not "the most interesting ones". If this concept has 12 sub-parts that aren't trivially skipped, return all 12. The orchestrator picks how many *layers* to descend; you pick *breadth*, and breadth is **all of them**. Same applies to `entities`, `people`, `artifacts`: list every one you actually saw, not a curated highlight reel. Curation comes from the user in the preview step, not from you.
>
> What to *skip* in `children`: anything auto-generated, vendored, mirrored, archived-and-superseded, or trivial. You decide the cutoff based on what you actually see — there's no fixed exclusion list. Hidden / cache / build artifacts are usually skip; sub-units that no human would discuss are usually skip. **When in doubt, include — the user trims in the preview.**

The orchestrator (you) parses the YAML, builds the tree, and uses each child's `handle` + `handle_type` to spawn the next round of agents.

### 6. Assemble and preview the tree — get approval before writing

Combine all agent reports into a tree. **Show it to the user and wait for approval** before any `cortex write`.

Preview format (one screen, scannable):

```
(would create / update under notes/<umbrella>/<root>/...)

+ notes/<umbrella>/<root>.md                          [umbrella, new]
+ notes/<umbrella>/<root>/<sub-A>.md                  [<kind> — "<one-line summary>"]
+ notes/<umbrella>/<root>/<sub-A>/<leaf-1>.md         [<kind> — "<one-line summary>"]
+ notes/<umbrella>/<root>/<sub-A>/<leaf-2>.md         [<kind> — "<one-line summary>"]
~ notes/<umbrella>/<root>/<sub-B>.md                  [exists — would update body]
- notes/<umbrella>/<root>/<sub-C>.md                  [SKIP — flagged as deprecated by agent]

cross-links proposed (N):
  <root>/<sub-A> → tools/<tool-1>             [uses]
  <root>/<sub-A> → people/<person>            [maintained-by]
  ...
```

Let the user trim, rename, drop links, change the umbrella, or swap depth. Re-render after edits.

### 7. Write the tree — through the CLI, never raw files

Per the `cortex` skill's hard rule: **never** `Read` / `Write` / `cat` files in `~/cortex/` directly. Everything goes through the CLI, and **every** state-changing command takes `--ai`.

Write parents first, then children, then sibling links. Batch with `--no-commit` and finish with one commit:

```bash
# 0. (only if creating it) umbrella note — root scene → must set cortex.position
cortex write notes/<umbrella>.md \
  --title "<Umbrella>" \
  --source inferred --confidence <high|medium|low> \
  --no-commit --ai \
  --body-stdin <<'BODY'
<one-line characterisation of the umbrella>
BODY
cortex update <umbrella> \
  --set cortex.position.x=<0.3..0.7> \
  --set cortex.position.y=<0.35..0.65> \
  --no-commit --ai

# 1. the root the user named (child of umbrella → no position required)
cortex write notes/<umbrella>/<root>.md \
  --title "<root>" \
  --tag <umbrella> --tag <kind> \
  --source inferred \
  --confidence <agent's confidence: high|medium|low> \
  --no-commit --ai \
  --body-stdin <<'BODY'
<one-paragraph "what / why" from the agent report>

Children: [[<sub-A>]], [[<sub-B>]], ...
BODY

# 2. children, grand-children. Filesystem path mirrors the tree, BUT the
#    filename slug must be globally unique (cortex resolves IDs by slug only).
#    For generic leaf names (config, middleware, state, prompts, ...) prefix
#    with the root: notes/<umbrella>/<root>/<root>-config.md → id "<root>-config".
#    Before each write, sanity-check the slug is free:
cortex get <root>-config 2>&1 | grep -q "unknown id" || echo "COLLISION — pick a different slug"

# 3. cross-links the agents surfaced (only those the user approved).
#    `cortex link` and all id-bearing commands take BARE SLUGS, not paths:
cortex link <sub-A-slug> <tool-1-slug> --kind uses --no-commit --ai

# 4. one final commit for the whole scan
cortex commit "scan: <root> (L<N>, M nodes, K cross-links)" --ai
```

If a slug-collision sneaks through anyway, fix it with the dedicated commands:
- `cortex mv <old-id> <new-id>` — renames the note, moves the asset, rewrites every wikilink and hotspot pointing at it, re-indexes.
- `cortex rm <id>` — deletes the note + asset; refuses if there are backlinks unless `--force`.
Both honor `--no-commit` and `--ai`.

If the user picked **top-level** for the target (no umbrella), step 0 doesn't apply but step 1 *itself* creates a root scene — apply the `cortex update <root> --set cortex.position.x=… --set cortex.position.y=…` block after the `cortex write`. Pick coordinates per the `cortex` skill's placement guidance, peeking at `cortex atlas view --json` to avoid colliding with existing roots.

Body conventions (echo what the `cortex` skill expects):

- **Map agent confidence onto `--confidence`** — pass the value the agent reported (high / medium / low). Don't blanket-default everything to "medium" — that destroys the signal.
- Open with one short paragraph: what this is and why it exists. Use the agent's `what` + `why` verbatim if good.
- Add a short `Children:` line with `[[wikilinks]]` to direct children — that's how the atlas threads scenes.
- Add `Entities:`, `People:`, `Artifacts:` lines only when the agent found real values. Empty sections are noise.
- Default `--source inferred` (you inferred this from the medium, not from the user telling you). Bump to `read` when the agent quoted directly from an authoritative source (the README of a project, the abstract of a paper, the canonical doc page); bump to `experienced` only when it's a direct user statement.
- Tag consistently: the umbrella, the agent-reported `kind`, and any obvious domain tags. Don't invent tags the agent didn't surface.

For cross-links: follow the default policy from "Built-in defaults" above — exact-match only via `cortex search`, drop silently when there's no match. Show the proposed links in the preview tree (step 6); don't ask up-front.

### 8. Generate scene images (automatic, no per-node prompting)

Re-read the `cortex` skill's image rule first — **scenes are concrete metaphors, not diagrams**.

After the tree is committed, run:

```bash
cortex image gen --all-stale --ai
```

`--all-stale` is a strict superset of `--all-missing`. It paints:

1. **Every brand-new node** the scan just created (parents + leaves) — `--coverage exhaustive` is auto-picked since the listed children fully describe the new parent.
2. **Every pre-existing parent whose children set just changed** because this scan attached a sub-tree under it (umbrellas like `tools/`, project roots like an existing `<service>` note that just got a new feature). The CLI auto-picks `--coverage partial` for these so the parent's broader identity stays visible — the new child shows up as one labeled landmark in a corner, the rest of the canvas stays as the parent's other (unmapped) areas. **Without this, the parent visually collapses into the new feature.**

One command, parallel internally (default 6 workers; for >30 nodes push to `--workers 10`, capped by API rate limits). Single commit.

**Verify the run completed cleanly**:

```bash
cortex image stale
```

Must return empty. If it doesn't (partial failure: API throttle, generator crash), re-run `cortex image gen --all-stale --ai` until it does — those stale entries won't fix themselves on a future scan.

Don't ask the user per-node. Surface the time estimate up front (parallel ⇒ ≈ 30-220s total regardless of count). For very large scans (>30 affected nodes) warn once about API/cost before kicking off.

For tricky parents whose default prompt still yields a diagram-y result, you can override with a metaphor nudge — but only after the batch finishes and you can see the result:

```bash
cortex image gen <root> --prompt \
  "Depict <root> as a <concrete place metaphor> with several <sub-elements>, each one a sub-concept. NOT a flowchart." \
  --ai
```

If you need to force coverage manually (rare — typically only when auto-detection misclassifies a freshly-created umbrella as partial because something earlier set its sceneAsset), pass `--coverage exhaustive` or `--coverage partial` explicitly.

### 9. Final summary

Tell the user:

- How many notes were created vs updated, and the umbrella path.
- How many cross-links were added.
- How many images were (re)generated.
- One starter command: `cortex neighbors <umbrella>/<root> --depth 2`.
- `cortex atlas serve` if they want to see the visual atlas.

## Hard rules

The general rules from the `cortex` skill all apply here — never touch `~/cortex/` raw, always pass `--ai`, never run raw `git`, set `cortex.position` on every root scene you create, never paint scenes as diagrams. The rules below are scan-specific:

- **Never** create a note for a sub-concept the agent reported as deprecated, vendored, mirrored, or trivial. Skip it.
- **Never** invent fields the agent didn't actually find — empty stays empty.
- **Never** spawn deep fan-out without showing the estimate first and asking the user to pick the depth.
- **Never** start writing before the user approves the preview tree.
- **Within the chosen depth, the scan is exhaustive.** Every node at every layer that survives the ignore list gets its own note — and every entity / person / artifact the agent surfaced gets carried into the note. Depth picks *layers*, never *note count*. Curating down to a tidy number ("L2 ≈ 10 notes") is a bug — the count reflects the structure that's actually there.
- **Never** ask the user about boundaries / cross-links / image generation up-front — those are governed by the "Built-in defaults" section. Only ask when the target itself is ambiguous (e.g. "research X" without context).
- **Never** use the labels "L1 / L2 / L3 / L4" when prompting the user for depth — translate into plain language with concrete fan-out numbers in their target.
- **Never** ask per-node about scene images — `cortex image gen --all-stale --ai` paints every node (parents + leaves) AND repaints stale existing parents in parallel, with a single commit.
- **Never** finish a scan with `cortex image stale` returning non-empty. `--all-stale` does the work; verify after, re-run if a partial failure left entries behind.
- **Never** force `--coverage exhaustive` on a parent that already had a sceneAsset before this scan. The auto-detection picks `partial` for incrementally-repainted parents so they don't visually collapse into the new child — trust it unless you're explicitly fixing a misclassification.
- **Carry the agent's `confidence` field through to `cortex write --confidence`** — don't flatten it to a uniform default.

## What you do NOT do here

- Do NOT use this skill for a single thought or short note — that's the `cortex` skill (`cortex capture`).
- Do NOT scan something the user didn't name (no scanning the home directory, the entire web, "their whole life", etc.). The target is always explicit.
- Do NOT chase children outside the boundary the user set in step 1.
- Do NOT recurse beyond the depth the user picked, even if the agent seems eager.
- Do NOT create children before their parent note exists — the filesystem convention requires it.
- DO run `cortex remote push` automatically after the scan's commit if origin is configured (see the `cortex` skill's "Remote sync" section). Skip silently if no remote.
