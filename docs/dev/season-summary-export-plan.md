# Season summary export — wiring plan

Plan for hooking `SeasonSummaryGraphic` (currently showcase-only, see
`app/features/user-page/components/SeasonSummaryGraphic.tsx`) up to the
`/u/:identifier/seasons` page as an exportable image.

## Spec

- Export lives on the user's seasons page. Only the **profile owner** can export
  their own image.
- Supporter perk belongs to the **profile owner**: supporters
  (`isSupporter()` from `~/modules/permissions/utils`, i.e. `patronTier >= 2`)
  can export **any** season they participated in, including the in-progress one.
- Non-supporters can export **only the latest finished season** and **only
  during off-season** (`Seasons.current() === null`; latest finished =
  `Seasons.allFinished()[0]`).
- No participation in the season → no export
  (`seasonsParticipatedIn.includes(season)`, already in the seasons layout loader).
- Gating must be enforced **server-side** in whatever loader serves the data,
  not just by hiding the button.

## Data plumbing per prop

| Prop | Source | Status |
| --- | --- | --- |
| `user` | parent route layout loader (`UserPageLoaderData`) | exists |
| `season`, `seasonDateRange` | `Seasons.nthToDateRange(season)` | exists |
| `tier`, `sp` | `userSkills(season)` + `currentOrdinal`, already in `u.$identifier.seasons.server.ts`; convert with `ordinalToSp` (component takes SP values, not ordinals) | exists |
| `spProgression` | `SkillRepository.findSeasonProgressionByUserId` — already returns per-day max ordinal with `yyyy-MM-dd` dates; map ordinal → SP | exists |
| `setsWon/Lost`, `mapsWon/Lost` | `PlayerStatRepository.findSeasonSetWinrateByUserId` / `findSeasonMapWinrateByUserId` | exists |
| `longestWinStreak` | chronological W/L list of all season sets (SQ + tournament) → streak computed in a pure helper | **new query + helper** |
| `clutch` | same chronological sets query: a set had a deciding map ⟺ score margin is 1 (4-3 in SQ, 2-1/3-2 in tournaments); `won` = margin-1 wins, `total` = margin-1 sets | same query as streak |
| `soloRank` | `LeaderboardRepository.findUserSPLeaderboard(season)` → user's `placementRank`. Full-board query is heavy; a cheaper alternative is `rank = 1 + count(users with higher ordinal and >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD matches)` | exists (optimize if needed) |
| `teamRank` | `LeaderboardRepository.findTeamLeaderboardBySeason({ onlyOneEntryPerUser: false })` (the ALL variant per spec) → first entry containing the user; `mates` = members minus self; `sp` = entry power. Heaviest query of the bunch | exists (heavy) |
| `topMates` | `PlayerStatRepository.findSeasonMatesEnemiesByUserId({ type: "MATE" })` → top 3 by sets | exists |
| `bestStage` | `PlayerStatRepository.findSeasonStagesByUserId` → aggregate winrate per stage across modes, pick best with a minimum maps threshold (e.g. ≥ 10 maps, so a 2–0 stage doesn't win) | exists + helper |
| `activeDays` | `Skill` rows grouped by date (same join shape as `findSeasonProgressionByUserId`): `groupMatchId` set → `"sq"`, `tournamentId` set → `"tournament"`, both on same date → `"both"` | **new query** |
| `bestSets` | see below | **new query** |
| `bestTournament` | user's season `TournamentResult` rows joined with `Tournament.tier` (stored column, 1=X best … 9=C) + teams count; scored by helper below | **new query + helper** |
| `topWeapons` | `ReportedWeaponRepository.findSeasonReportedWeaponsByUserId` → top 3, `usagePercentage` = count / total reported | exists |

## Best sets query (the big one)

Won sets ranked by average opponent SP at match time, top 3, across SQ and
ranked tournaments.

- **SQ**: for each won `GroupMatch`, every opponent group member has a `Skill`
  row snapshot with that `groupMatchId` — average those ordinals.
- **Tournament**: for each won `TournamentMatch`, take the opponent roster's
  `Skill` rows for that `tournamentId`. Require ≥ 2 opponents with a calculated
  skill that season, otherwise skip the set.
- Note: the per-match `Skill` row is the *post-match* snapshot; that's an
  acceptable approximation of "at the time".
- Output per set: opponent players (name + countryCode), score, avg opponent SP,
  context (`"SendouQ"` or tournament name).
- Validate the query and thresholds against `db-prod.sqlite3` before wiring.

## Best tournament scoring

Tier-dominant composite, placement quality breaks ties between adjacent tiers:

```
score = (10 - tier) * 3 + log2(teamsCount / placement)
```

Pure helper (e.g. `app/features/user-page/core/season-summary.ts`) with unit
tests. Same module can house the streak computation and best-stage pick.

## Export mechanism (shared decision with tournament graphics)

No export-to-image mechanism exists yet — `TournamentResultsGraphic` and
`TournamentRunGraphic` are also showcase-only. Decide once for all three:

- Recommended: client-side DOM → PNG (e.g. `modern-screenshot` /
  `html-to-image`) inside a dialog showing the graphic + a download button.
- **Risk to verify first**: CDN images (avatars, weapon/tier/stage images from
  sendou-assets / DO Spaces) must be CORS-readable or the canvas taints and
  export fails. Identicons are canvas data URLs (safe). Test one real avatar +
  the stage banner early; may need `crossOrigin="anonymous"` + CDN header check.
- The graphic is fixed 720px wide; in the dialog it can be scaled down visually
  with a CSS transform while exporting at natural size.

## Loader shape

Don't put the heavy queries (team leaderboard ALL, best sets) in the main
seasons loader that runs on every page view. Fetch lazily when the export
dialog opens: a dedicated loader route
(`/u/:identifier/seasons/summary-graphic?season=N`, added to `routes.ts`)
that runs the full gating check (`requireUser`, owner check, supporter/off-season
check, participation check) and returns the assembled props.

## UI wiring

- Export button on the seasons page, rendered only when viewing own profile and
  gating allows the selected season. Consider showing a disabled state with a
  popover explaining the supporter perk for other seasons (upsell moment) —
  decide at implementation time.
- Page `handle` needs `"calendar"` added to its i18n namespaces (the graphic
  uses `calendar:count.teams`); `"user"` is already there, `"game-misc"` is
  always included.

## Edge cases

- Tentative/approximate ordinal (`currentOrdinal` undefined): user has no
  calculated rank → block export (participation alone isn't enough to render a
  meaningful card).
- Component already self-hides: chart (< 2 progression days), team/solo rank,
  best stage, best sets, best tournament, top weapons/mates when data missing.
- Dev `Seasons.list` has only 2 test seasons (one ends 2030) — the component
  takes `seasonDateRange` as a prop for this reason; use `dev:prod` /
  `db-prod.sqlite3` for realistic testing.
- Supporter exporting the in-progress season: allowed, data is partial by
  design.

## Suggested implementation order

1. Pure helpers + unit tests (win streak, tournament run score, best stage pick).
2. New repository functions (`activeDays`, best sets, chronological results for
   streak, best tournament source) following `repositories.md` conventions;
   add benchmark cases per the `db-benchmark` skill; validate on `db-prod.sqlite3`.
3. Server-side assembly function mapping repository data → component props +
   gating util, with tests.
4. Loader route + export button + dialog on the seasons page.
5. PNG export mechanism (shared with the tournament graphics).
6. e2e happy path (owner + supporter + off-season non-supporter).
