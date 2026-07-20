# Trophies branch — review checklist

Findings from the multi-agent branch review (diff vs `main`, ~8,200 lines / 96 files) plus a feature-completeness audit. Ordered by priority within each section.

## Before merge — security & bugs

- [x] **Hidden events leak through trophy win details** — `app/features/trophies/TrophyRepository.server.ts`
      `findWinsByOwner` (backs the unauthenticated `/trophies/:id/wins/:userId` route) is missing the `CalendarEvent.hidden = 0` filter that `findTournamentsByTrophyId` has. Hidden events (drafts, tests, unpublished series children) leak tournament details, teammate usernames, set results, and weapon usage. Add the filter.
- [x] **Hidden events leak through recent-tournament tier computation** — `app/features/trophies/TrophyRepository.server.ts`
      Same missing `hidden = 0` filter in `withRecentTournament` (backs `/trophies` list + org pages). Lower impact, same fix.
- [x] **Corrupt model row crashes the whole render, SSR included** — `app/features/trophies/trophies-utils.ts`
      `decompressTrophyModel` has no error handling; it runs in `Trophy.tsx`'s body before the try/catch that only guards `JSON.parse`. Make it return `null` on failure (like tier-list-maker's `decompress()`) and route failures into the existing Ban-icon error UI. Same unguarded call in `UpdateTrophyForm` (`trophies.new.tsx`).

## Before merge — DB indexes (verified via EXPLAIN QUERY PLAN)

All three go into `migrations/158-trophies.js` (branch convention), then rebuild db-test/e2e seeds and patch the dev db.

- [x] **Critical:** `create index "trophy_owner_user_id" on "TrophyOwner"("userId")` — `findByOwnerUserId` full-scans `TrophyOwner` on every user profile view.
- [x] **Critical:** `create index "calendar_event_trophy_id" on "CalendarEvent"("trophyId")` — new column is unindexed; `/trophies` listing and org pages drive from full `Tournament` scans.
- [x] **Warning:** `create index "trophy_owner_trophy_id" on "TrophyOwner"("trophyId", "userId")` — serves the trophy-page owners list (`withOwners`) and the wins modal (`findWinsByOwner`).

## Before merge — needs a product decision

- [x] **Favorite-sorting diverges from badges** — `app/features/user-page/core/trophy-sorting.server.ts`
      Decision: clearing all favorites for non-supporters is intentional for trophies (badges keep 1). No code change. The divergence being deliberate also means the two files should stay separate rather than collapsing into a generic `sortItemsByFavorites`.

## Before merge — CLAUDE.md violations

- [x] `useMemo` in `UpdateTrophyForm` (`app/features/trophies/routes/trophies.new.tsx`) — component is remounted per trophy via `key`; use a plain `const`.
- [x] `.forEach()` in `trophyWinsTournament` (`app/db/seed/index.ts`) — use `for...of` with `.entries()`.
- [x] `&&` conditional render in `NewTrophyReceiversSelector` (`app/features/tournament-bracket/routes/to.$id.brackets.finalize.tsx`) — use a ternary.
- [x] (Lower confidence) `useEffect`-based `trophyId` reset in `TrophyField` (`app/features/calendar/routes/calendar.new.tsx`) — evaluated and kept: organization/badges are schema-generated `FormField`s with no change-handler hook, and keying wouldn't clear form-context state, so the effect is the least-bad sync point.

## Follow-up — abstraction consolidation

- [x] **Duplicate pako helpers** — `trophies-utils.ts` `compressTrophyModel`/`decompressTrophyModel` vs `tier-list-maker-utils.ts` `compress`/`decompress`, both added on this branch. Extract one shared base64-deflate util in `app/utils/` (fold the decompress error handling in while at it).
- [x] **Trophy-tile box CSS copy-pasted across ~7 CSS modules** (tier border + `radius-field` + `bg-high`; also the 100px-grid + placeholder pattern 3×). Bake a variant class into the Trophy component/module.
- [x] **Repeated Kysely subqueries in `TrophyRepository.server.ts`** — `CalendarEventDate` min-startTime subquery 4×, `teamsCount` 2×. Extract shared helpers next to `tournamentLogoWithDefault` in `app/utils/kysely.server.ts`.
- [x] **`TrophyPagination` duplicates `BadgePagination`** — extract a shared `DotPagination` in `app/components/` (`usePagination` data half is already shared).
- [x] **Win-header row duplicates `TournamentHistoryEntry`** — near-identical logo + name + `TierPill` + meta markup/CSS in `TrophyDisplay.tsx` vs `TrophyTournamentHistory.tsx`; extract a `TournamentSummaryRow`.
- [x] **Move `useProgressiveRender` to `app/hooks/`** — decided to keep it in `trophies-utils.ts` while only trophy surfaces use it; move to `app/hooks/` if another feature ever needs it.

## Follow-up — small cleanups

- [x] `R.omit` instead of `_`/`__`/`___` throwaway destructuring in `findByOwnerUserId` / `findByOwnerUserIdIncludingHidden` (`TrophyRepository.server.ts`).
- [x] Reuse `app/hooks/useDebounce.ts` in `ModelField` (`trophies.new.tsx`) instead of the hand-rolled ref/timer debounce.

## Completeness gaps

- [ ] **Unit tests** — none in the feature. Highest value: `syncSpecialTrophies` (precedent: `BadgeRepository.server.test.ts` for `syncXPBadges`), `parseSpecialTrophyCode`, compress/decompress round-trip.
- [ ] **E2e tests** — zero trophy coverage; components already expose `data-testid`s (`trophy-display`, `trophy-pagination-button`, tier pill test ids).
- [ ] **Benchmark cases** — `scripts/benchmark-db.ts` has no cases for the new `TrophyRepository` read functions (project convention for new repository reads).
- [ ] **Notifications** — nothing in the trophy flow notifies anyone. Badges precedent: `BADGE_ADDED`. Candidates: trophy awarded on finalize, pending trophy approved/declined (notify submitter).
- [ ] **Per-trophy meta tags** — `/trophies/:id` has no `meta` export; `badges.$id.tsx` has one (title + owner info) to mirror.

## Future additions (fine to defer past this branch)

- [ ] Public API exposure — badges appear in the public user endpoint (`api-public`); trophies don't.
- [ ] Admin/staff flow for creating special trophies (currently migration-only by design).
- [ ] Surface `SpecialTrophyOwner.createdAt` ("obtained on") — stored but never displayed.

## Verified fine (no action)

- Tournament finalization awards trophies with tier (`TournamentRepository`), calendar assignment validates org, approval/decline/delete/edit actions are permission-gated, finalize receiver list is re-validated server-side.
- No SQL injection, no XSS, no zip-bomb vector (model input length-bounded and compressed server-side).
- `SpecialTrophyOwner`/`TournamentResult`/`ReportedWeapon` query paths all use existing indexes.
- Routes registered, i18n namespaces wired, CSS modules paired, container queries used, ids typed as numbers.
