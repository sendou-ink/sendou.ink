---
name: sendou-code-review
description: Multi-agent code review that checks the current diff from multiple angles (spec compliance, bugs from two lenses, conventions/modernization, abstraction reuse, security, DB query performance, test coverage, English copy proofreading) plus mechanical pre-checks, adversarially verifies every finding, and writes a unified review to code-review-findings.md in the project root. Works on branch diffs vs main or uncommitted changes.
---

Review the current code changes from multiple angles using parallel sub-agents, adversarially verify each finding, then synthesize a single review and write it to `code-review-findings.md` in the project root.

**Token discipline — never load the full diff into your own (orchestrator) context.** Build all review material as files in the scratchpad directory using shell redirection, and point sub-agents at those files to read themselves. The only diff-related things you read directly are `--stat` output, line counts, grep hits, and the small findings JSON agents return.

## Step 1: Build the review material (files, not context)

Let `$M` be your scratchpad directory. Run:

```
git branch --show-current
git status --porcelain -uall
```

Let `BASE` be `main` when on a branch (covers committed, staged, and unstaged in one diff), or `HEAD` when on main (staged + unstaged).

Build these files with redirection — do not print their contents:

1. **Full diff**: `git diff BASE -- ':(exclude)locales/' > $M/review.patch`. The `locales/` exclusion keeps `i18n:sync` JSON churn out of the review; apply it to every diff/stat command below.
2. **Untracked files**: plain diffs never show them. For each untracked file in the porcelain output (git status already excludes gitignored files), skipping anything under `locales/`, append it: `{ echo "=== NEW UNTRACKED FILE: <path> ==="; cat <path>; } >> $M/review.patch`. These get reviewed like any other changed code.
3. **Copy diff**: `git diff BASE -- 'locales/en/' > $M/copy.patch`, then append untracked `locales/en/` files the same way. This goes only to the Copy Editor agent.

Then gather the small context you do read:

- `git diff BASE --stat -- ':(exclude)locales/'` → the changed-file list (plus untracked non-locales paths from porcelain).
- `wc -l $M/review.patch $M/copy.patch` → sizes for sharding decisions.
- `cat .nvmrc` → Node version.

Do NOT paste CLAUDE.md/AGENTS.md into any prompt — the agent that needs them reads them from the repo itself.

If `review.patch` is empty (no diff, no untracked files) and `copy.patch` is empty, tell the user: "Nothing to review. Either check out a feature branch or make some changes." and stop.

## Step 2: Mechanical pre-checks (no agents)

Greppable rules — run them yourself against `$M/review.patch` (added lines start with `+`). Each hit is a **pre-confirmed finding** that skips verification and goes straight to synthesis.

1. **Typecheck**: `pnpm run typecheck`. Errors in changed files → pre-confirmed findings the review should lead with. Continue regardless.
2. **Leftover debug code**: `grep -nE '^\+.*(console\.log|test\.only|describe\.only|it\.only)' $M/review.patch`.
3. **Undefined CSS variables**: extract `var(--...)` names from added lines (`grep -oE` on the patch), check each is defined in `app/styles/vars.css` or locally in a changed file (grep, don't read). Undefined → finding.
4. **Unregistered routes**: for each new file under a `routes/` directory, grep `app/routes.ts` for its path. Not referenced → finding.
5. **Missing CSS module pairing**: a new `.tsx` file with non-trivial styling but no matching `.module.css`. Use judgement — files with no styling needs are fine.

## Step 3: Collect the spec

If the user provided an issue URL or description, that is the spec. Otherwise derive intent instead of skipping:

- On a branch: `git log main..HEAD --format="%s%n%b"`. If a commit or branch name references `#123`, run `gh issue view 123`. If a PR exists, `gh pr view --json title,body`.
- Combine into the spec — "does the code do what the commits claim" is still valuable.
- Skip the Spec Compliance agent only if there is genuinely nothing (no input, no commits, no PR).

## Step 4: Launch parallel finder agents

Launch all applicable agents as parallel Agent calls with `model: "sonnet"`. Use `subagent_type: "Explore"` for Abstraction Police, `general-purpose` for the rest.

**Shared preamble — prepend to every finder prompt** (substituting real values; the copy editor gets its own variant below):

```
Review material: read {abs_path}/review.patch — the full diff under review, including "=== NEW UNTRACKED FILE: <path> ===" sections with complete new-file contents. Do not run git diff yourself; the patch file is the single source of truth. Read the changed source files for surrounding context where needed (only the relevant sections of large files).

Changed files: {file_list}

Only flag issues in NEW code (lines added/changed in the diff), never pre-existing issues. Be specific: file path, line number, exact problem, concrete suggestion. If you find nothing meaningful, return an empty array — do not manufacture issues.

Your final message must be ONLY a JSON array of findings:
[{"file": "...", "line": 42, "category": "...", "severity": "critical|warning|info", "claim": "one sentence", "detail": "how it manifests, 1-3 sentences", "suggestion": "concrete fix"}]
```

**Sharding for large diffs**: if `review.patch` exceeds ~2000 lines, shard. Split the changed-file list into roughly equal chunks by line count and build per-shard patches (`git diff BASE -- <shard's files> > $M/shard-N.patch`, appending that shard's untracked files); each instance gets its shard patch plus the full file list for context. Findings merge into one pool.

**Agent budget:**
- Cap at **3 shards**.
- Over ~4000 lines: shard only the high-signal finders (Spec, both Bug lenses, Security); run the rest as single instances over the full patch — they degrade gracefully.
- Hard ceiling: **20 finder calls**. Drop shards from lowest-priority finders first (Conventions, then Abstraction).
- Over ~8000 lines: stop and ask the user — capped review (state agent count), narrow to a subset they pick, or riskiest files only (Repositories, actions/loaders, permission code) — recommend the last.

### Agent 1: Spec Compliance (skip only if Step 3 found nothing)

```
You are reviewing code changes for spec compliance. The expected behavior (from user description, commit messages, and/or linked issue/PR):
{spec}

Check whether the implementation actually does what the spec describes:
- Missing requirements the spec calls for but the code doesn't implement
- Behavior that contradicts the spec
- Edge cases the spec implies but the code doesn't handle

Only flag real gaps. Do not flag things the spec doesn't mention. category: "spec"; in detail state what the spec expected vs what the code does.
```

### Agent 2: Conventions (CLAUDE.md rules + modernization)

```
You are reviewing code changes for project-rule compliance and modern-practice opportunities.

First read CLAUDE.md and AGENTS.md at the repo root for the project rules.

A) Rule violations — only flag CLEAR violations; where a rule says "prefer"/"avoid", use judgement (a minor deviation in context is not a violation). category: "claude-md", severity: "warning", claim quotes the rule.

B) Modernization — environment: Node.js {node_version}, today is {current_date}. Only suggest features that are Baseline Widely Available (all major browsers, 2.5+ years). Check for:
- Old JS patterns with modern replacements (`.indexOf() !== -1` → `.includes()`, `var` → `const`/`let`, string concat → template literals, Promise chains → async/await, optional chaining / nullish coalescing / destructuring opportunities)
- Old CSS patterns (obsolete vendor prefixes, workarounds for native features like `:has()`, flexbox `gap`, logical properties, `color-mix()`)
- Old HTML (missing semantic elements, unnecessary ARIA where native elements suffice)
- Old React patterns (e.g. useEffect where useSyncExternalStore would work)
- Manual operations that existing Remeda functions cover (Remeda is the project's utility library)

Only flag modernizations that are clearly better (more readable, shorter, or faster), not stylistic washes. category: "modernization", severity: "info", claim = current pattern, suggestion = modern replacement.
```

### Agent 3: Bug Finder — client lens

```
You are reviewing code changes for bugs, focused on the CLIENT side: React components, hooks, state, data flow, UI logic. Look for (not exhaustive):
- Logic errors in components/hooks (wrong conditions, off-by-one, incorrect comparisons)
- Null/undefined access that could crash at render time
- State bugs (stale closures, state incorrectly derived from props, missing dependency arrays — note this project doesn't use useMemo/useCallback)
- Broken data flow (props passed but ignored, wrong prop, stale loader data)
- Form handling and optimistic UI mistakes
- Rendering bugs (wrong list keys, conditional rendering that hides errors)

Focus on bugs that would actually manifest. Do not flag theoretical issues prevented by surrounding code or the type system. category: "bug".
```

### Agent 4: Bug Finder — server/data lens

```
You are reviewing code changes for bugs, focused on the SERVER side: loaders, actions, Repository code, SQL, validation, authorization-adjacent logic. Look for (not exhaustive):
- Logic errors (wrong conditions, off-by-one, incorrect comparisons)
- Null/undefined access that could crash at runtime
- Race conditions/ordering issues (concurrent actions, non-atomic read-then-write)
- Incorrect type assumptions at boundaries (request params, DB rows)
- Missing error handling at system boundaries (external APIs, user input)
- Incorrect SQL (wrong joins, missing WHERE, wrong aggregation)
- Missing transactions where multiple writes must be atomic
- Data returned to the client that doesn't match what the component expects

Focus on bugs that would actually manifest. Do not flag theoretical issues prevented by surrounding code or the type system. category: "bug".
```

### Agent 5: Abstraction Police (`subagent_type: "Explore"`)

```
You are reviewing code changes for reuse of existing abstractions and excessive copy-paste. Search the codebase to check:
1. Does new code duplicate logic that already exists in a utility, helper, or shared component?
2. Does it copy-paste chunks from other files instead of extracting a shared abstraction?
3. Could existing components/hooks/utilities have been reused instead?

Three-strikes rule: 2 instances of duplication is acceptable; 3+ should be abstracted. Search broadly — `app/utils/`, `app/components/`, `app/hooks/`, `app/modules/`, and files adjacent to the changed files.

Do NOT flag: similar-looking one-liners (e.g. `if (!user) return null`), idiomatic standard patterns, or duplication that exists only in old code. category: "abstraction"; detail cites where the existing code lives.
```

### Agent 6: Security

```
You are reviewing code changes for security vulnerabilities in a Remix/React Router app with SQLite (Kysely).

Project auth conventions — check against these real patterns, not generic boilerplate:
- Server-side auth: `requireUser()` from `app/features/auth/core/user.server.ts` returns the authenticated user or throws.
- Role/permission guards: `requireRole(role)` and `requirePermission(...)` from `app/modules/permissions/guards.server.ts`; helpers like `isAdmin`/`isStaff` in `app/modules/permissions/utils.ts`.
- Client hooks `useHasRole`/`useHasPermission` (`app/modules/permissions/hooks.ts`) are UI display only, NOT security boundaries. Every action and sensitive loader must enforce auth server-side.

Check for:
- Loaders/actions reading or mutating without the appropriate guard, or guarding with the wrong scope (IDOR — can user A touch user B's data by changing an id?)
- SQL injection (raw queries or string interpolation in SQL, even with Kysely)
- XSS (unescaped user input as HTML, dangerouslySetInnerHTML with user data)
- Sensitive data exposure (tokens/passwords/PII in logs, loader responses, or client code — everything a loader returns is visible to the client)
- Path traversal, open redirects via user-controlled URLs
- Missing input validation at system boundaries

Only real, exploitable vulnerabilities in the new code. Do not flag generic best-practice advice, things the framework already handles (React escaping, framework CSRF), or pre-existing issues. category: "security", claim = vulnerability type + summary, detail = attack scenario.
```

### Agent 7: DB Query Performance (skip if the diff touches no Repository/Kysely code; `subagent_type: "general-purpose"`)

```
You are reviewing code changes for database query performance (SQLite via Kysely).

IMPORTANT: run all analysis against `db-prod.sqlite3` — a safe-to-experiment copy of production (~2GB). Do NOT use the tiny dev `db.sqlite3` if `db-prod.sqlite3` exists; its query plans and table sizes are meaningless.

1. **Identify new/changed DB queries** in the diff (`*Repository.server.ts`, Kysely). Read the full changed Repository files.

2. **Get the real SQL** — do not mentally compile Kysely. Write a throwaway script at `scripts/tmp-review-compile.ts` (must live inside the project so vite-node resolves the `~` alias; delete when done) that rebuilds the query with the project's `db` instance and prints `compiled.sql` and `compiled.parameters`:

   import { db } from "~/db/sql";
   const compiled = db.selectFrom(/* rebuild from Repository code */).compile();
   console.log(compiled.sql, compiled.parameters);

   Run: `DB_PATH=db-prod.sqlite3 VITE_PROD_MODE=true pnpm vite-node scripts/tmp-review-compile.ts`. Substitute realistic parameter values.

3. **For each query**:
   a. `sqlite3 db-prod.sqlite3 "EXPLAIN QUERY PLAN <compiled SQL with params substituted>"`
   b. Measure, don't guess: `SELECT COUNT(*)` for every table touched.
   c. Missing indexes: "SCAN <table>" vs "SEARCH ... USING INDEX". A SCAN on a large table in a hot path is a red flag. Inspect with `.indexes <table>` and `PRAGMA index_info(<index>)`.
   d. Call frequency: hot path (loader on every page view, frequent API) vs cold (admin action, rare routine)? Check the caller. Also check N+1 patterns — queries in loops that could be batched.

4. **Severity**: critical = measured full scan on a large table in a hot path, or N+1; warning = scan on a medium table or missing index on a frequently-filtered column; info = scan on a small table or infrequent query.

5. **Do NOT flag**: queries already using appropriate indexes, scans on tiny (<~100 measured rows) infrequently-accessed tables, pre-existing unchanged queries.

category: "db-performance"; detail = EXPLAIN output + measured row counts + call-frequency assessment; suggestion = e.g. "add index on X(Y)" or "batch into one WHERE IN".
```

### Agent 8: Test Coverage

```
You are reviewing code changes for test coverage gaps (Vitest unit/browser tests, Playwright e2e). Compare what logic changed against what tests changed:

1. Changed pure-logic Modules (imported as `* as Module`, JSDoc'd functions): do unit tests (`*.test.ts` nearby) exist and were they updated with the logic?
2. New Repository READ functions: project convention gives these benchmark cases in `scripts/benchmark-db` (`pnpm run bench:db`). Flag new read functions without one.
3. New routes or significant user flows: any e2e spec covering them? Check the e2e directory.
4. Bug-fix-shaped changes (tightened conditional, handled edge case): is there a regression test proving the fix?

Do NOT flag: trivial/presentational changes, code impractical to unit test and covered transitively by e2e, pre-existing untested code not touched by this diff. category: "test-coverage"; suggestion = what kind of test and where.
```

### Agent 9: Copy Editor (skip if `copy.patch` is empty AND the diff adds no English user-facing strings; never sharded)

Its preamble points at `copy.patch` instead of the full patch:

```
You are proofreading English texts shown to users of sendou.ink, a competitive Splatoon community website.

Read {abs_path}/copy.patch — new/changed English strings in locales/en/*.json (including "=== NEW UNTRACKED FILE ===" sections). Also scan {abs_path}/review.patch for ADDED English user-facing strings in code (JSX text, aria-labels, error messages, notification texts).

Only review ADDED or CHANGED strings. Check for:
- Typos and misspellings
- Grammar mistakes (subject-verb agreement, articles, tense)
- Broken i18next interpolation: mismatched/misspelled `{{variable}}` placeholders, wrong plural key forms — compare against how the key is used in code if unsure
- Unclear phrasing — would a user reading it out of context know what to do?
- Unnecessarily technical wording where plainer language is friendlier
- Inconsistent terminology/capitalization vs the rest of the site — read existing `locales/en/*.json` to learn established terms (SendouQ, scrims, tournaments, ...) and match them

Severity: typos/grammar/broken interpolation = "warning"; clarity rewording = "info".

Do NOT flag: established community/game terminology (Splatoon terms, ability/mode names), intentionally short labels that fit the UI, or rewordings that aren't clearly better. category: "copy", claim = the problematic text quoted, suggestion = the corrected text quoted.

Your final message must be ONLY a JSON array: [{"file", "line", "category": "copy", "severity", "claim", "detail", "suggestion"}]
```

If a finder returns malformed JSON, salvage what you can from its output; do not re-run it.

## Step 5: Adversarial verification

Pool all finder findings (their JSON is small — fine to hold in context). **Skip verification for**: Step 2 pre-checks (tool-confirmed), db-performance findings with measured EXPLAIN/COUNT evidence, and copy findings (proofreading is judgement — filtered at synthesis instead). Everything else gets verified.

Launch verifiers in parallel (`model: "sonnet"`, `general-purpose`). Over ~12 findings, batch by file so each verifier takes 2-4 findings from the same file. Hard ceiling: **10 verifier calls** — grow batch size (up to ~6 findings sharing files), not agent count.

```
You are a skeptical senior engineer. Your job is to REFUTE the following code review finding(s). Assume each is a false positive until the code proves otherwise.

Finding(s):
{finding_json}

The diff under review is at {abs_path}/review.patch. Read the relevant hunks there and the actual files involved. For each finding, check:
- Does the claimed problem actually exist in the code as written?
- Is it prevented by surrounding code, the type system, upstream validation, or the framework?
- For bugs: can you trace a concrete input/state that triggers it?
- For abstraction findings: does the cited existing code actually fit this use case?
- For spec findings: does the code actually diverge from the spec, or did the finder misread one of them?
- Is it about NEW code in the diff, or pre-existing?

If uncertain, default to refuted — a review's value depends on zero false positives.

Return ONLY a JSON array, one entry per finding: [{"claim": "<copy of the finding's claim>", "verdict": "confirmed" | "refuted", "reason": "1-2 sentences"}]
```

Discard refuted findings.

## Step 6: Synthesize (no agent — do this yourself)

From the surviving findings (verified + pre-checked + measured + copy):

1. **Deduplicate**: merge findings multiple agents flagged from different angles, keeping the best explanation.
2. **Filter**: drop nitpicks that wouldn't matter in practice or would make the code worse/more complex — including weak copy suggestions.
3. **Prioritize**: Typecheck failures > Security > Bugs > DB Performance (critical/warning) > Spec Violations > Test Coverage > Abstraction > CLAUDE.md Violations > Copy (warning) > Modernization > Copy (info) > DB Performance (info).

## Step 7: Write the report file

Write the review to **`code-review-findings.md` in the project root** (overwrite any previous one; it is a generated report — do not commit it):

```markdown
# Code Review

_{branch or "uncommitted changes on main"} — {date}_

**{N} issues found** (or "No issues found — looks good!")

## 1. [{category}] {brief title}

`{file_path}:{line}` — {severity}

{detail — 1-3 sentences explaining the problem}

**Suggestion**: {suggestion}
```

Group surviving modernization suggestions and info-level copy rewordings under a final `## Suggestions` section (nice-to-haves, not blockers).

In chat, do NOT repeat the findings. Write only a short prose wrap-up: issue count by severity, a pointer to `code-review-findings.md`, and anything notable (sharding, skipped agents, refuted-finding count).
