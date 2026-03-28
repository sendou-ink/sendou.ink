---
name: sendou-code-review
description: Multi-agent code review that checks the current diff from 6 angles (spec compliance, modernization, bugs, CLAUDE.md rules, abstraction reuse, security) and produces a unified review. Works on branch diffs vs main or staged changes.
---

Review the current code changes from multiple angles using parallel sub-agents, then synthesize into a single high-quality review.

## Step 1: Determine what to review

Run these commands to figure out what to review:

```
git branch --show-current
```

- If NOT on `main`: get the diff with `git diff main...HEAD` and also `git diff` for any unstaged changes on the branch. Combine them — this is the **full diff**.
- If on `main`: get staged changes with `git diff --cached`. If there are no staged changes, tell the user: "Nothing to review. Either check out a feature branch or stage some changes." and stop.

Also run these in parallel:
- `cat .nvmrc` to get the Node.js version
- Read the `CLAUDE.md` and `AGENTS.md` files for the project rules
- `git diff main...HEAD --stat` (or `git diff --cached --stat` on main) to get the list of changed files

## Step 2: Collect context from the user

The user may have provided a GitHub issue URL or description of what the code should do as an argument. If they did, this will be used by the Spec Compliance agent. If not, the Spec Compliance agent will be skipped.

## Step 3: Launch 6 parallel review agents

Launch these as parallel Agent calls. Each agent receives:
- The full diff
- The list of changed files
- Access to read the full files for surrounding context

**Important for all agents:**
- Only flag issues in the NEW code (lines added/changed in the diff). Do not flag pre-existing issues.
- Be specific: cite file paths and describe the exact problem and a concrete suggestion.
- If you find nothing meaningful, say so — do not manufacture issues.

### Agent 1: Spec Compliance (skip if no issue/description provided)

```
You are reviewing code changes for spec compliance.

The user described the expected behavior as:
{user_provided_spec}

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Check whether the implementation actually does what the spec describes. Look for:
- Missing requirements that the spec calls for but the code doesn't implement
- Behavior that contradicts the spec
- Edge cases the spec implies but the code doesn't handle

Only flag real gaps between spec and implementation. Do not flag things the spec doesn't mention.

Return a list of issues, each with: file path, description of the gap, and what the spec expected.
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

Return a list of suggestions, each with: file path, the current code pattern, and the modern replacement.
```

### Agent 3: Bug Finder

```
You are reviewing code changes for bugs.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. Look for (not a comprehensive list):
- Logic errors (wrong conditions, off-by-one, incorrect comparisons)
- Null/undefined access that could crash at runtime
- Race conditions or ordering issues
- Incorrect type assumptions
- Missing error handling at system boundaries (external APIs, user input)
- State management bugs (stale closures, missing dependency arrays — but note this project doesn't use useMemo/useCallback)
- Incorrect SQL queries (wrong joins, missing WHERE clauses, SQL injection)
- Broken data flow between components

Focus on bugs that would actually manifest in practice. Do not flag theoretical issues that are prevented by the surrounding code or type system.

Return a list of bugs, each with: file path, description of the bug, how it would manifest, and a suggested fix.
```

### Agent 4: CLAUDE.md Compliance

```
You are reviewing code changes for compliance with the project's CLAUDE.md rules.

Here are the project rules:
{claude_md_content}

Here is the diff:
{diff}

Changed files: {file_list}

Only flag clear violations. If a rule says "prefer" or "avoid", use judgement — a minor deviation in context is not a violation.

Return a list of violations, each with: file path, the rule violated (quote it), and the offending code.
```

### Agent 5: Abstraction Police

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

Search broadly — check `app/utils/`, `app/components/`, `app/hooks/`, and files adjacent to the changed files.

Do NOT flag:
- Simple one-liners that happen to look similar (e.g., `if (!user) return null`)
- Standard patterns that are idiomatic and don't benefit from abstraction
- Duplication that exists only in the old code (not introduced by this diff)

Return a list of issues, each with: file path, the duplicated pattern, where it already exists in the codebase (with file paths), and a suggestion for how to share it.
```

### Agent 6: Security

```
You are reviewing code changes for security vulnerabilities.

Here is the diff:
{diff}

Changed files: {file_list}

Read the full changed files for context. This is a Remix/React Router web application with SQLite (via Kysely). Check for:
- SQL injection (even with Kysely, check for raw queries or string interpolation in SQL)
- XSS (unescaped user input rendered as HTML, dangerouslySetInnerHTML with user data)
- CSRF vulnerabilities
- Authorization bypasses (missing permission checks, IDOR — can user A access user B's data?)
- Sensitive data exposure (tokens, passwords, or PII in logs, responses, or client-side code)
- Path traversal (user-controlled file paths)
- Insecure redirects (open redirect via user-controlled URLs)
- Missing input validation at system boundaries

Focus on real, exploitable vulnerabilities in the new code. Do not flag:
- General best-practice advice that isn't a concrete vulnerability
- Issues in frameworks/libraries (Remix, React) that handle security themselves
- Pre-existing issues not introduced by this diff

Return a list of vulnerabilities, each with: file path, vulnerability type (e.g., "SQL Injection"), description, attack scenario, and suggested fix.
```

## Step 4: Summarize

After all agents complete, launch a single summarizer agent that receives ALL agent outputs.

```
You are the final reviewer synthesizing code review feedback from 6 specialized agents.

Here are their findings:

{all_agent_outputs}

Your job:
1. **Deduplicate**: Multiple agents may flag the same issue from different angles. Merge these into a single finding.
2. **Filter**: Remove low-quality suggestions that are:
   - Nitpicks that wouldn't matter in practice
   - False positives or theoretical issues unlikely to occur
   - Suggestions that would make the code worse or more complex
   - Pre-existing issues not introduced by the diff
3. **Prioritize** using this order: Security > Bugs > Spec Violations > Abstraction Issues > CLAUDE.md Violations > Modernization Suggestions
4. **Format** the output as a single cohesive review

Output format:

### Code Review

**{N} issues found** (or "No issues found — looks good!" if none survive filtering)

For each surviving issue, in priority order:

**{priority_number}. [{category}] {brief title}**
`{file_path}`

{description — 1-3 sentences explaining the problem and a concrete suggestion}

---

At the end, if there were modernization suggestions that survived filtering, group them under a separate "Suggestions" section (these are nice-to-haves, not blockers).
```

## Important notes

- Use `subagent_type: "Explore"` for Agent 5 (Abstraction Police) since it needs to search the codebase broadly
- Use `subagent_type: "general-purpose"` for the other agents
- Use `model: "sonnet"` for agents 1-6 and `model: "opus"` for the summarizer
- Pass the actual diff content and file list to each agent — do not tell them to run git commands themselves
- If the diff is very large (>2000 lines), mention this to the user and note that the review may miss some issues
- Present the summarizer's output directly to the user as the final review
