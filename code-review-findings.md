# Code Review

_tournament-multi-step — 2026-10-09_

Scope: compared against the merge-base with `origin/main` (local `main` is out of date), limited to the riskiest files at the user's request. Covered: tournament-bracket core and engine, calendar `BracketBuilder` and the new-tournament schemas, utils and progression form, the bracket finalize action and loader, the tournament actions and repository, and migration `20261005071057-grouped-elimination.ts`. Not reviewed: UI components (`BracketProgressionBuilder.tsx`, `calendar.new.tsx`, `SendouForm`, `MapPoolPicker`), CSS, and tests. The English locale strings were proofread in full.

**8 issues found** (plus suggestions)

## 1. [bug] Registration-close check runs on invitational tournaments, where the field is hidden

`app/features/calendar/calendar-new-schemas.ts:314` — warning

The new check that `regClosesAt` is not after `startTime` ignores `isInvitational`. `calendar.new.tsx` hides the `regClosesAt` field for invitational tournaments, and toggling invitational does not clear the stored value. To trigger it, set a closing time, switch to invitational, then move the start time earlier: the form refuses to submit. The only feedback is SendouForm's fallback error for an unrendered field, which shows the raw field name `(regClosesAt)`. `calendar.new.server.ts` also still saves the stale `regClosesAt` for invitational events.

**Suggestion**: Add `!data.isInvitational` to the refinement condition. Also drop `regClosesAt` in the action when `isInvitational` is true.

## 2. [test-coverage] Grouped-elimination seeding path is untested

`app/features/tournament-bracket/core/Seeding.ts:60` — warning

The `groupCount > 1` branch and `resolveGroupedLineupPositions` (block-of-positions-per-group layout, uneven groups) are never exercised. No test passes `groupCount`, and the grouped e2e spec doesn't assert lineup positions. If this logic disagreed with the engine's own group distribution, follow-up brackets would be seeded wrong with no test failing.

**Suggestion**: Add `Seeding.test.ts` cases with `groupCount` 2 and 4, covering even and uneven team counts, asserting each group's teams land in the expected blocks.

## 3. [test-coverage] Grouped map-list logic in PreparedMaps has no tests

`app/features/tournament-bracket/core/PreparedMaps.ts:167` — warning

Nothing in unit or e2e tests covers `mapListRounds`/`mapListData`, the grouped guard in `trimMapsByTeamCount` (line 248) or `groupEliminationPlacementSizes`. The `PreparedMaps.test.ts` changes only rename the third-place setting.

**Suggestion**: Add `PreparedMaps.test.ts` cases for grouped SE/DE (`groupCount: 2`). Cover map-list rounds, trimming as the team count crosses the 1-group → 2-group boundary, and placement sizes with skipped rounds.

## 4. [test-coverage] Rewritten `getRounds` naming has no direct assertions

`app/features/tournament-bracket/core/rounds.ts:10` — warning

Round names now come from section and round position. Several special cases have no direct test: a single-match grand final, skipped rounds (the last played round keeps its "Semis" name), a hidden bracket reset, the third-place match, and the `groupId` param. The only test caller, `PreparedMaps.test.ts`, uses the names as keys and never compares them to expected strings.

**Suggestion**: Add `rounds.test.ts` with a `test.each` table over SE/DE brackets built via `Engine.create`. Cover the full bracket, skipped FINALS/SEMIS, skipped GRAND_FINALS/BRACKET_RESET, a 2-team group and a grouped bracket.

## 5. [test-coverage] New `INVALID_SKIPPED_ROUNDS` validation error is untested

`app/features/tournament-bracket/core/Progression.ts:376` — warning

`INVALID_GROUP_COUNT` gets a test (`Progression.test.ts:799`), but no test anywhere references `INVALID_SKIPPED_ROUNDS`. Untested branches: `skippedRounds` on a non-elimination bracket, and a `SkippedRounds.isValid` failure, e.g. skipping SEMIS while FINALS is played, or a round from the wrong bracket type.

**Suggestion**: Add `bracketsToValidationError` cases in `Progression.test.ts` for each of those branches.

## 6. [abstraction] Single/double-elimination type check copied five times

`app/features/calendar/calendar-progression-form.ts:461` — warning

`type === "single_elimination" || type === "double_elimination"` appears in five places:

- a private `isEliminationType` in `calendar-progression-form.ts:461`
- a second private copy in `tournament-bracket-utils.ts`
- inline twice in `BracketBuilder.ts` (`isGrouped`, `knockedOutRoundOptions`)
- inline in `PreparedMaps.ts` `mapListRounds`

**Suggestion**: Export one `isEliminationType` type guard (e.g. from `tournament-bracket-utils.ts`) and use it in all five places.

## 7. [abstraction] "Elimination split into groups" rule repeated across form code

`app/features/calendar/core/BracketBuilder.ts:449` — info

The form-level `Number(eliminationGroupCount) > 1` check is written in `BracketBuilder.isGrouped`, `BracketBuilder` `settingsFromFormValues`, `calendar-progression-form.ts` and `BracketProgressionBuilder.tsx`. The DB-side equivalent lives separately in `tournament-bracket-utils.ts` `showsOneGroupAtATime`.

**Suggestion**: Make `BracketBuilder.isGrouped`, built on the shared `isEliminationType` from #6, the single form-level predicate, and call it from the other three places.

## 8. [copy] `{{count}} maps` has no singular form

`locales/en/calendar.json:183` — warning

`newTournament.review.mapCount` is called with a real count in `calendar.new.tsx:541`. A one-map pool is valid, so the review step shows "1 maps". `builder.maxTeams` ("up to {{count}} teams", line 89) has the same problem, though a 1-team cap is unlikely.

**Suggestion**: Split into `newTournament.review.mapCount_one: "{{count}} map"` / `_other: "{{count}} maps"`, and the same for `builder.maxTeams`. Then run `pnpm run i18n:sync`.

## Suggestions

- **[claude-md] Pass-through helper in the middle of `SkippedRounds.ts`** (`app/features/tournament-bracket/core/SkippedRounds.ts:37`): `dependentsOf(round)` only returns `DEPENDENTS[round]` and sits above the exported API, which breaks the helpers-at-bottom rule. Index `DEPENDENTS[round]` directly, or move the helper next to `inPlayOrder` at the bottom.
- **[copy] Comma splices in new hint strings**: `calendar.json:80` ("…left to right, pick a bracket…"), `:81` ("…in a loop, pick a bracket…"), `:122` ("…of the {{count}} groups, the range applies…") and `forms.json:405` ("…end the bracket early, the teams still in it…"). Use a period, or "so"/"and", if you want them grammatical. They're fine if this is a deliberate terse style.
- **[copy] Unclear disabled-round hint** (`locales/en/forms.json:406`): "Not played without {{round}}" reads oddly out of context. Consider "Can't be played unless {{round}} is played".
- **[copy] Changelog wording** (`changelog/2026-10-08-tournament-map-pool-required.md:5`): "organizer picked maps" → "organizer-picked maps", or "Tournaments where organizers pick the maps…".
