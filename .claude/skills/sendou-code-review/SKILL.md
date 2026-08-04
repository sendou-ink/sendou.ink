---
name: sendou-code-review
description: Multi-agent code review that checks the current diff from multiple angles (spec compliance, modernization, bugs from two lenses, CLAUDE.md rules, abstraction reuse, security, DB query performance, test coverage, English copy proofreading) plus mechanical pre-checks, adversarially verifies every finding, and produces a unified review. Works on branch diffs vs main or uncommitted changes.
---

Review the current code changes from multiple angles using parallel sub-agents, adversarially verify each finding, then synthesize into a single high-quality review. If the diff contains no changes to Repository files or SQL/Kysely code, skip Agent 8 (DB Query Performance).

## Step 1: Determine what to review

Run these commands to figure out what to review:

```
git branch --show-current
git status --porcelain -uall
```

- If NOT on `main`: get the diff with `git diff main -- ':(exclude)locales/'` — this compares the working tree against main, so it covers committed, staged, AND unstaged changes in one diff.
- If on `main`: get uncommitted changes with `git diff HEAD -- ':(exclude)locales/'` (covers both staged and unstaged).
- **Translation files are excluded**: the `':(exclude)locales/'` pathspec keeps `locales/` JSON churn (mostly `i18n:sync` output) out of the review — it is noise, not reviewable code. Apply the same exclusion to every diff/stat command below.
- **But collect the English copy separately**: also run `git diff main -- 'locales/en/'` (or `git diff HEAD -- 'locales/en/'` on main), plus untracked files under `locales/en/`. This is the **copy diff** — it is NOT part of the full diff and goes only to Agent 10 (Copy Editor).
- **Untracked files**: plain diffs never show untracked files. For every untracked file in the `git status --porcelain -uall` output (these are not gitignored — git status already excludes ignored files), skip anything under `locales/`, then read the file's full content and append it to the review material clearly marked as "NEW UNTRACKED FILE: {path}". These files get reviewed like any other changed code.
- If the diff is empty and there are no untracked files, tell the user: "Nothing to review. Either check out a feature branch or make some changes." and stop.

The diff plus untracked file contents is the **full diff** referenced below.

Also run these in parallel:
- `cat .nvmrc` to get the Node.js version
- Read the `CLAUDE.md` and `AGENTS.md` files for the project rules
- `git diff main --stat -- ':(exclude)locales/'` (or `git diff HEAD --stat -- ':(exclude)locales/'` on main) to get the list of changed files

## Step 2: Mechanical pre-checks (no agents)

These rules are greppable and don't need an LLM. Run them yourself now; each hit becomes a **pre-confirmed finding** passed straight to the summarizer (they skip the verification stage).

1. **Typecheck**: run `pnpm run typecheck`. If it fails on changed files, record each error as a pre-confirmed finding — the review should lead with these rather than agents flagging downstream symptoms. Continue with the review regardless.
2. **Undefined CSS variables**: for every `var(--...)` in added lines of CSS/TSX, verify the variable is defined in `app/styles/vars.css` or locally in one of the changed files. Undefined → finding.
3. **Unregistered routes**: for every new file added under a `routes/` directory (e.g. `app/features/*/routes/*.tsx`), grep `app/routes.ts` for its path. Not referenced → finding.
4. **Missing CSS module pairing**: a new `.tsx` file that defines components with non-trivial styling but has no matching `.module.css` file. Use judgement — files with no styling needs are fine.
5. **Leftover debug code**: grep added lines for `console.log`, `test.only`, `describe.only`, `it.only`.

## Step 3: Collect the spec

The user may have provided a GitHub issue URL or description of what the code should do as an argument. If they did, use it for the Spec Compliance agent.

If they did NOT, derive the intent instead of skipping:
- On a branch: run `git log main..HEAD --format="%s%n%b"` for commit messages. If a commit or the branch name references an issue (`#123`), fetch it with `gh issue view 123`. If a PR exists, fetch `gh pr view --json title,body`.
- Combine whatever you found into the spec. "Does the code do what the commits claim" is still a valuable check.
- Only skip the Spec Compliance agent if there is genuinely nothing: no user input, no commits (e.g. uncommitted changes on main), no PR.

## Step 4: Launch parallel finder agents

Launch these as parallel Agent calls. Each agent receives:
- The full diff (including untracked file contents)
- The list of changed files
- Access to read the full files for surrounding context

**Sharding for large diffs**: if the full diff exceeds ~2000 lines, do not warn and shrug — shard. Split the changed file list into roughly equal chunks (by line count) and run one instance of each finder agent per chunk, giving each instance its chunk's diff plus the full file list for context. Findings from all instances merge into the same pool.

**Agent budget — sharding must not explode usage on a massive branch:**
- Cap at **3 shards** no matter the diff size.
- If the diff exceeds ~4000 lines, only shard the high-signal finders (Agents 1, 3, 4, 7 — spec, both bug lenses, security). Run the rest (modernizer, CLAUDE.md, abstraction, test coverage) as a single instance each over the full diff; they degrade gracefully with size.
- Hard ceiling: **at most 20 finder agent calls** total. If the plan would exceed that, drop shards from the lowest-priority finders first (modernization, then CLAUDE.md, then abstraction).
- If the diff exceeds ~8000 lines, stop and ask the user before launching anything: proceed with the capped review (state the approximate agent count), or narrow the review to a subset they pick (e.g. specific directories/features), or review only the riskiest files (Repositories, actions/loaders, permission-related code) — recommend the last option.

**Important for all agents:**
- Only flag issues in the NEW code (lines added/changed in the diff). Do not flag pre-existing issues.
- Be specific: cite file paths and line numbers, describe the exact problem and a concrete suggestion.
- If you find nothing meaningful, return an empty list — do not manufacture issues.

**Structured output — every finder returns JSON**, an array of findings shaped:

```json
{
  "file": "app/features/foo/FooPage.tsx",
  "line": 42,
  "category": "bug | security | db-performance | spec | claude-md | abstraction | modernization | test-coverage | copy",
  "severity": "critical | warning | info",
  "claim": "one-sentence statement of the problem",
  "detail": "how it manifests / why it matters, 1-3 sentences",
  "suggestion": "concrete fix"
}
```

Tell each agent to output ONLY the JSON array as its final message. Agent-specific extra fields are noted per agent below.

### Agent 1: Spec Compliance (skip only if no spec could be collected in Step 3)

```
You are reviewing code changes for spec compliance.

The expected behavior (from user description, commit messages, and/or linked issue/PR):
{spec}

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Check whether the implementation actually does what the spec describes. Look for:
- Missing requirements that the spec calls for but the code doesn't implement
- Behavior that contradicts the spec
- Edge cases the spec implies but the code doesn't handle

Only flag real gaps between spec and implementation. Do not flag things the spec doesn't mention.

Return ONLY a JSON array of findings: [{file, line, category: "spec", severity, claim, detail (what the spec expected vs what the code does), suggestion}]
```

### Agent 2: Modernizer

```
You are reviewing code changes for modern web development practices.

Environment: Node.js {node_version} (from .nvmrc). Today's date is {current_date}. Only suggest features that are Baseline Widely Available (supported across all major browsers for at least 2.5 years). Do not suggest features that are Baseline Newly Available or not yet Baseline.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Check for:
- Old JavaScript patterns that have modern replacements (e.g., `.indexOf() !== -1` → `.includes()`, manual array operations → modern array methods, `var` → `const`/`let`, string concatenation → template literals, Promise chains → async/await, for loops → array methods where clearer)
- Old CSS patterns that have modern replacements (e.g., old flexbox syntax, vendor prefixes for widely-supported properties, workarounds for things CSS can now do natively like `:has()`, `gap` in flexbox, logical properties, `color-mix()`)
- Old HTML patterns (e.g., missing semantic elements, unnecessary ARIA when native elements suffice)
- Verbose patterns that have concise modern equivalents (e.g., optional chaining, nullish coalescing, object shorthand, destructuring)
- Old React patterns (e.g. useEffect where useSyncExternalStore would work)
- The project uses Remeda as its utility library — check if any manual operations could use existing Remeda functions

Only flag cases where the modern approach is clearly better (more readable, shorter, or more performant). Do not flag stylistic preferences that are a wash.

Return ONLY a JSON array of findings: [{file, line, category: "modernization", severity: "info", claim (the current pattern), detail, suggestion (the modern replacement)}]
```

### Agent 3: Bug Finder — client lens

```
You are reviewing code changes for bugs, focused on the CLIENT side: React components, hooks, state, data flow, and UI logic.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Look for (not a comprehensive list):
- Logic errors in components and hooks (wrong conditions, off-by-one, incorrect comparisons)
- Null/undefined access that could crash at render time
- State management bugs (stale closures, state derived incorrectly from props, missing dependency arrays — but note this project doesn't use useMemo/useCallback)
- Broken data flow between components (props passed but ignored, wrong prop, stale loader data)
- Form handling and optimistic UI mistakes
- Rendering bugs (wrong keys in lists, conditional rendering that hides errors)

Focus on bugs that would actually manifest in practice. Do not flag theoretical issues that are prevented by the surrounding code or type system.

Return ONLY a JSON array of findings: [{file, line, category: "bug", severity, claim, detail (how it manifests), suggestion}]
```

### Agent 4: Bug Finder — server/data lens

```
You are reviewing code changes for bugs, focused on the SERVER side: loaders, actions, Repository code, SQL, validation, and authorization-adjacent logic.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Look for (not a comprehensive list):
- Logic errors (wrong conditions, off-by-one, incorrect comparisons)
- Null/undefined access that could crash at runtime
- Race conditions or ordering issues (concurrent actions, non-atomic read-then-write)
- Incorrect type assumptions at boundaries (request params, DB rows)
- Missing error handling at system boundaries (external APIs, user input)
- Incorrect SQL queries (wrong joins, missing WHERE clauses, wrong aggregation)
- Transactions missing where multiple writes must be atomic
- Data returned to the client that doesn't match what the component expects

Focus on bugs that would actually manifest in practice. Do not flag theoretical issues that are prevented by the surrounding code or type system.

Return ONLY a JSON array of findings: [{file, line, category: "bug", severity, claim, detail (how it manifests), suggestion}]
```

### Agent 5: CLAUDE.md Compliance

```
You are reviewing code changes for compliance with the project's CLAUDE.md rules.

Here are the project rules:
{claude_md_content}

Here is the diff:
{diff}

Changed files: {file_list}

Only flag clear violations. If a rule says "prefer" or "avoid", use judgement — a minor deviation in context is not a violation.

Return ONLY a JSON array of findings: [{file, line, category: "claude-md", severity: "warning", claim (quote the rule violated), detail (the offending code), suggestion}]
```

### Agent 6: Abstraction Police

```
You are reviewing code changes for proper reuse of existing abstractions and avoiding excessive copy-paste.

Here is the diff:
{diff}

Changed files: {file_list}

Your job is to search the codebase to check:
1. Does the new code duplicate logic that already exists in a utility, helper, or shared component? Search for similar patterns in the codebase.
2. Does the new code copy-paste chunks from other files instead of extracting a shared abstraction? Search for the same patterns elsewhere.
3. Are there existing components, hooks, or utilities in the project that could have been reused instead of writing new code?

Use the "three strikes" rule: a small amount of duplication (2 instances) is acceptable. Three or more instances of the same pattern means it should be abstracted.

Search broadly — check `app/utils/`, `app/components/`, `app/hooks/`, `app/modules/`, and files adjacent to the changed files.

Do NOT flag:
- Simple one-liners that happen to look similar (e.g., `if (!user) return null`)
- Standard patterns that are idiomatic and don't benefit from abstraction
- Duplication that exists only in the old code (not introduced by this diff)

Return ONLY a JSON array of findings: [{file, line, category: "abstraction", severity, claim (the duplicated pattern), detail (where it already exists — cite file paths), suggestion (how to share it)}]
```

### Agent 7: Security

```
You are reviewing code changes for security vulnerabilities.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. This is a Remix/React Router web application with SQLite (via Kysely).

Project auth conventions — check against these real patterns, not generic boilerplate:
- Server-side auth: `requireUser()` from `app/features/auth/core/user.server.ts` returns the authenticated user or throws.
- Role/permission guards: `requireRole(role)` and `requirePermission(...)` from `app/modules/permissions/guards.server.ts`. Helpers like `isAdmin`/`isStaff` live in `app/modules/permissions/utils.ts`.
- Client-side hooks `useHasRole`/`useHasPermission` (`app/modules/permissions/hooks.ts`) are for UI display only — they are NOT security boundaries. Every mutation (action) and sensitive loader must enforce auth server-side.

Check for:
- Loaders/actions that read or mutate data without the appropriate `requireUser`/`requireRole`/`requirePermission` guard, or that guard with the wrong scope (IDOR — can user A access or mutate user B's data by changing an id?)
- SQL injection (even with Kysely, check for raw queries or string interpolation in SQL)
- XSS (unescaped user input rendered as HTML, dangerouslySetInnerHTML with user data)
- Sensitive data exposure (tokens, passwords, or PII in logs, loader responses, or client-side code — remember everything a loader returns is visible to the client)
- Path traversal (user-controlled file paths)
- Insecure redirects (open redirect via user-controlled URLs)
- Missing input validation at system boundaries

Focus on real, exploitable vulnerabilities in the new code. Do not flag:
- General best-practice advice that isn't a concrete vulnerability
- Issues in frameworks/libraries (Remix, React) that handle security themselves (e.g. React's default escaping, framework CSRF handling)
- Pre-existing issues not introduced by this diff

Return ONLY a JSON array of findings: [{file, line, category: "security", severity, claim (vulnerability type + summary), detail (attack scenario), suggestion}]
```

### Agent 8: DB Query Performance (skip if no Repository/Kysely changes in diff)

```
You are reviewing code changes for database query performance. This is a Remix/React Router web app using SQLite via Kysely.

IMPORTANT: run all analysis against `db-prod.sqlite3` — a copy of the production database (~2GB, safe to experiment with). Do NOT use `db.sqlite3` if `db-prod.sqlite3` exists (the dev db is tiny, so its query plans and table sizes are meaningless for performance analysis).

Here is the diff:
{diff}

Changed files: {file_list}

Your job:

1. **Identify new or changed DB queries** in the diff. These live in `*Repository.server.ts` files and use Kysely. Read the full changed Repository files for context.

2. **Get the real SQL** — do not mentally compile Kysely. Write a small throwaway script at `scripts/tmp-review-compile.ts` (it must live inside the project so vite-node resolves the `~` alias; delete it when you are done) that rebuilds the query with the project's `db` instance and prints the compiled SQL:

   ```ts
   import { db } from "~/db/sql";

   const compiled = db
     .selectFrom(/* ...rebuild the query from the Repository code... */)
     .compile();
   console.log(compiled.sql);
   console.log(compiled.parameters);
   ```

   Run it with: `DB_PATH=db-prod.sqlite3 VITE_PROD_MODE=true pnpm vite-node scripts/tmp-review-compile.ts` (this matches how the project's own `bench:db` script runs). Substitute realistic parameter values from the printed parameters.

3. **For each query**:

   a. **Run EXPLAIN QUERY PLAN** against the prod copy:
      ```
      sqlite3 db-prod.sqlite3 "EXPLAIN QUERY PLAN <the compiled SQL with parameters substituted>"
      ```

   b. **Measure table sizes — do not guess**: `sqlite3 db-prod.sqlite3 "SELECT COUNT(*) FROM <table>"` for every table the query touches.

   c. **Check for missing indexes**: Look at the EXPLAIN output for "SCAN <table>" (full table scan) vs "SEARCH <table> ... USING INDEX" or "USING COVERING INDEX". A SCAN on a large table in a hot path is a red flag. Check existing indexes with `sqlite3 db-prod.sqlite3 ".indexes <table_name>"` and `PRAGMA index_info(<index_name>)`.

   d. **Assess call frequency**: Is this query in a hot path (page loader hit on every page view, API called frequently) or a cold path (admin action, background routine, rare user action)? Use the route file or caller to determine how the Repository function is invoked. Also check for N+1 patterns — a query called inside a loop that could be batched.

4. **Severity**:
   - **critical**: Full table scan on a large table (measured, not guessed) in a hot path, or N+1 query pattern
   - **warning**: Full table scan on a medium table, or missing index on a frequently-filtered column
   - **info**: Scan on a small table or infrequent query — note it but don't flag as a problem

5. **Do NOT flag**:
   - Queries that already use appropriate indexes
   - Scans on tiny tables (< ~100 measured rows) that are accessed infrequently
   - Pre-existing queries not changed in this diff

Return ONLY a JSON array of findings: [{file, line, category: "db-performance", severity, claim, detail (EXPLAIN output + measured row counts + call frequency assessment), suggestion (e.g. "add index on X(Y)" or "batch these N queries into one with WHERE IN")}]
```

### Agent 9: Test Coverage

```
You are reviewing code changes for test coverage gaps. This project uses Vitest for unit/browser tests and Playwright for e2e tests.

Here is the diff:
{diff}

Changed files: {file_list}

Compare what logic changed against what tests changed:

1. **Changed pure-logic Modules** (files imported as `* as Module`, typically with JSDoc'd functions): do they have unit tests (`*.test.ts` alongside or in a nearby location)? Were the tests updated when the logic changed?
2. **New Repository READ functions**: the project convention is that these get benchmark cases in `scripts/benchmark-db` (run via `pnpm run bench:db`). Flag new read functions with no benchmark case.
3. **New routes or significant new user flows**: is there any e2e spec covering them? Check the e2e test directory for related specs.
4. **Bug-fix-shaped changes** (a conditional tightened, an edge case handled): is there a regression test proving the fix?

Do NOT flag:
- Trivial or purely presentational changes (styling, copy, layout)
- Code that is impractical to unit test and already covered transitively by e2e
- Pre-existing untested code not touched by this diff

Return ONLY a JSON array of findings: [{file, line, category: "test-coverage", severity, claim (what changed without coverage), detail, suggestion (what kind of test to add and where)}]
```

### Agent 10: Copy Editor (skip if the copy diff is empty AND the full diff adds no English user-facing strings)

This agent receives the **copy diff** (the `locales/en/` changes collected in Step 1) instead of the full diff, plus any added English user-facing strings from the full diff (JSX text, aria-labels, error messages, notification texts). It is never sharded.

```
You are proofreading English texts that will be shown to users of sendou.ink, a competitive Splatoon community website.

New/changed English strings from translation files (locales/en/*.json):
{copy_diff}

New English user-facing strings found in code (if any):
{code_strings}

Only review ADDED or CHANGED strings, not pre-existing ones. Check each for:
- Typos and misspellings
- Grammar mistakes (subject-verb agreement, articles, tense)
- Broken i18next interpolation: mismatched or misspelled `{{variable}}` placeholders, wrong plural key forms — compare against how the key is used in the code if unsure
- Unclear or confusing phrasing — would a user reading this out of context understand what to do?
- Unnecessarily technical or jargon-y wording where plainer language would be friendlier (e.g. "Invalid input" vs telling the user what to fix)
- Inconsistent terminology or capitalization vs the rest of the site — read the existing `locales/en/*.json` files to learn the established terms (e.g. how features like SendouQ, scrims, tournaments are referred to) and match them

Severity: typos, grammar mistakes, and broken interpolation are "warning". Clarity/friendliness rewording is "info".

Do NOT flag:
- Established community/game terminology that only looks unusual (Splatoon terms, ability names, mode names)
- Intentionally short labels where brevity fits the UI
- Style preferences that are a wash — only suggest a rewording if it is clearly better

Return ONLY a JSON array of findings: [{file, line, category: "copy", severity, claim (the problematic text, quoted), detail, suggestion (the corrected/improved text, quoted)}]
```

## Step 5: Adversarial verification

Collect all findings from the finder agents into one pool (parse their JSON outputs). **Do not verify** mechanical pre-check findings from Step 2 (already confirmed by tooling), db-performance findings that include measured EXPLAIN/COUNT evidence (already confirmed by measurement), or copy findings (proofreading is judgement, not a falsifiable claim — the summarizer filters these instead). Everything else gets verified.

For each remaining finding, launch a verifier agent. Run them in parallel. If there are more than ~12 findings, batch them by file so each verifier handles 2-4 findings from the same file. Hard ceiling: **at most 10 verifier agent calls** — with more findings than fits, grow the batch size rather than the agent count (a verifier can handle up to ~6 findings if they share files).

```
You are a skeptical senior engineer. Your job is to REFUTE the following code review finding(s). Assume each is a false positive until the code proves otherwise.

Finding(s):
{finding_json}

Relevant diff hunks:
{diff_excerpt}

Read the actual files involved. For each finding, check:
- Does the claimed problem actually exist in the code as written?
- Is it prevented by the surrounding code, the type system, validation upstream, or the framework?
- For bugs: can you trace a concrete input/state that triggers it?
- For abstraction findings: does the cited existing code actually fit this use case?
- For spec findings: does the code actually diverge from the spec, or did the finder misread one of them?
- Is the finding about NEW code in the diff, or a pre-existing issue?

If uncertain, default to refuted — a review's value depends on zero false positives.

Return ONLY a JSON array, one entry per finding: [{claim: "<copy of the finding's claim>", verdict: "confirmed" | "refuted", reason: "1-2 sentences"}]
```

Discard refuted findings. Confirmed findings (plus the exempted pre-checked/measured ones) proceed to the summarizer.

## Step 6: Summarize

Launch a single summarizer agent that receives all surviving findings.

```
You are the final reviewer synthesizing verified code review findings from multiple specialized agents plus mechanical pre-checks.

Here are the surviving findings (all have passed adversarial verification, mechanical checking, or direct measurement):

{surviving_findings_json}

Your job:
1. **Deduplicate**: Multiple agents may flag the same issue from different angles. Merge these into a single finding, keeping the best explanation.
2. **Filter**: Even verified findings can be nitpicks. Remove suggestions that wouldn't matter in practice or would make the code worse or more complex.
3. **Prioritize** using this order: Typecheck failures > Security > Bugs > DB Query Performance (critical/warning only) > Spec Violations > Test Coverage > Abstraction Issues > CLAUDE.md Violations > Copy (warning: typos/grammar/broken interpolation) > Modernization Suggestions > Copy (info: clarity rewordings) > DB Query Performance (info)

Return ONLY a JSON array of the final findings, in priority order, each shaped: {file, line, category, severity, claim, detail, suggestion}
```

## Step 7: Report

Report the summarizer's final findings with the **ReportFindings tool** (you, the main agent, call it — not a subagent): one call, findings ranked most-severe first, each with `file`, `line`, `summary` (claim + suggestion), `short_summary`, `category`, `failure_scenario` (from detail), and `verdict: "CONFIRMED"` for findings that passed verification or measurement, `"PLAUSIBLE"` otherwise. Do not also print the findings list as text — after the ReportFindings call, write only a short prose wrap-up (issue count, overall shape of the review, anything notable like sharding or skipped agents).

If the ReportFindings tool is not available in the session, fall back to printing this format instead:

### Code Review

**{N} issues found** (or "No issues found — looks good!" if none survive filtering)

For each finding, in priority order:

**{priority_number}. [{category}] {brief title}**
`{file_path}:{line}`

{description — 1-3 sentences explaining the problem and a concrete suggestion}

---

At the end, group surviving modernization suggestions and info-level copy rewordings under a separate "Suggestions" section (these are nice-to-haves, not blockers).

## Important notes

- Use `subagent_type: "Explore"` for Agent 6 (Abstraction Police) since it needs to search the codebase broadly
- Use `subagent_type: "general-purpose"` for Agent 8 (DB Query Performance) since it needs to run sqlite3 commands and vite-node scripts via Bash
- Use `subagent_type: "general-purpose"` for the other finder agents, the verifiers, and the summarizer
- Use `model: "sonnet"` for finder and verifier agents and `model: "opus"` for the summarizer
- Pass the actual diff content and file list to each agent — do not tell them to run git commands themselves
- If a finder agent returns malformed JSON, salvage what you can by reading its output; do not re-run it
- Present the review via ReportFindings as described in Step 7
