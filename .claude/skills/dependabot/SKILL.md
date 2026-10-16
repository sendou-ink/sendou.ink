---
name: dependabot
description: Resolve open Dependabot security alerts. Upgrades every vulnerable package that can be upgraded, and for the ones that can't (fix only in a new major of a parent package, no patched release) analyzes whether the vulnerability is actually exploitable in sendou.ink. Use when asked to fix, resolve or triage Dependabot / dependency security alerts or `bun audit` findings.
---

# Resolving Dependabot alerts

Rule: **upgrade everything where possible.** Only when an upgrade isn't feasible (the fix needs a major upgrade of a package we depend on, or no fixed version exists) do you fall back to analyzing whether the vulnerability can be exploited here.

## 1. List the open alerts

```sh
gh api 'repos/sendou-ink/sendou.ink/dependabot/alerts?state=open&per_page=100' --paginate \
  --jq '.[] | [.number, .security_advisory.severity, .dependency.package.name, .dependency.relationship, .security_vulnerability.vulnerable_version_range, (.security_vulnerability.first_patched_version.identifier // "none"), .security_advisory.summary] | @tsv'
```

Several alerts often share one package; group them by package and take the highest patched version.

## 2. Find out where each package comes from

```sh
bun why <pkg>                             # who pulls it in, and which versions are installed
npm view <parent>@<version> dependencies  # the range the parent allows
npm view <pkg>@<major> version            # releases available inside that major
```

Each package then needs one of these fixes:

| Situation | Fix |
|---|---|
| Direct dependency | Bump the exact version in `package.json` (deps are pinned, no `^`), then `bun install` |
| Transitive, fixed version fits the parent's range | `bun update <pkg> <pkg2> ...`, or an `overrides` entry in `package.json` when that doesn't reach it |
| Transitive, parent's range excludes the fix | Bump the parent to a minor/patch version whose range includes the fix (e.g. mermaid 12.1 → 12.2 to move katex 0.16 → 0.18) |
| Fix only in a new major of the parent, or no fixed version | Not feasible as a dependency bump → step 4 |

Gotchas:

- We normally hold back fresh releases (Dependabot's `cooldown` of 8 days in `.github/dependabot.yml`). Fixing a known vulnerability overrides that: using a fixed version released in the last few days is fine. If Bun refuses a version for being too new (`minimumReleaseAge` in `bunfig.toml`), lift the age limit for that package only.

- Packages listed under `patchedDependencies` in `package.json` are pinned to the patched version. Bumping one means regenerating its patch; prefer updating the vulnerable transitive deps underneath it instead.
- Don't add `overrides` that force a package across a major its parent doesn't support (e.g. tiptap 3 under tldraw 3); that breaks the parent. Overrides within a compatible range are fine when `bun update` can't reach the version.
- Some peer dependency warnings of `bun install` are pre-existing; compare against `git stash` before attributing them to your change.

After updating, re-run `bun why <pkg>` for every alerted package and confirm each installed version is at or above the patched version.

## 3. Verify

`bun run checks` must pass. Dependency bumps are internal, so no changelog entry.

## 4. When an upgrade isn't feasible: analyze exploitability

1. Read the full advisory: `gh api repos/sendou-ink/sendou.ink/dependabot/alerts/<n> --jq '.security_advisory.description, (.references[]?.url)'`. Note the exact preconditions (which function, what input shape).
2. Find how the package reaches our code (`bun why`) and where sendou.ink feeds that parent package data that an attacker could control (user content, uploaded/opened files, clipboard, URL params, other users' data from the DB).
3. Read the vulnerable package's installed source in `node_modules/<pkg>/src` (or `node_modules/<parent>/node_modules/<pkg>/src` for a version nested under its parent) and every caller the parent wires up, and trace whether attacker input can satisfy the preconditions.
4. Confirm empirically where practical: write a throwaway test reproducing the advisory's PoC against the installed version, then the same payloads through the path our app actually uses.
   - Put it inside the repo (e.g. `app/zz-tmp/<name>.browser.test.ts` for anything needing a DOM) and run it with `bunx vitest run <file>`; delete it afterwards.
   - A transitive package nested under its parent (not hoisted) is imported by absolute path into `node_modules/<parent>/node_modules/...`, the parent by the name `package.json` uses.
   - To see output, fail a deliberate `expect(out).toEqual({})`; `console.log` isn't shown.
5. Report to the user: the preconditions, where untrusted input enters, why it does or doesn't reach the vulnerable code, what the test showed, and what future change would make it exploitable. Recommend either dismissing the alert (with the Dependabot dismissal reason that fits, e.g. "Vulnerable code is not actually used") or a mitigation (patch via `bun patch`, or the major upgrade as a separate task).

Dismissing an alert is outward-facing; leave it to the user unless they ask you to do it.
