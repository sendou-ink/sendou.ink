# Code Review

_uncommitted changes on main — 2026-11-14_

**3 issues found**

## 1. [test-coverage] No test notices a BYE-vs-TBD sourced match counted as decided

`app/features/tournament-bracket/core/Bracket/Bracket.ts:814` — warning

Mutation run: 14 of 15 mutants in `winnerSideOf` and 5 of 7 in `isDecided` (lines 814–832) survive. One example: `return true ? advancingSide : null` at line 825, or `!match.opponent1 || !match.opponent2` at line 829. Either one makes a match where a BYE waits on a still-unknown team (BYE vs TBD) count as decided. If that shipped, an organizer could start the follow-up bracket before a team going to it is known, and that team would be missing from the follow-up's seeding.

**Suggestion**: In `Bracket.test.ts`, add a grouped elimination case where a sourced-tier match is BYE vs TBD because its feeder match is unplayed. Assert that `canBeStarted` / `relevantMatchesFinished` is false there, and true once the feeder is reported. Also add a BYE-vs-BYE sourced match that does not block an early start.

## 2. [test-coverage] Early start with exactly one sourced match is untested

`app/features/tournament-bracket/core/Bracket/Bracket.ts:759` — warning

Mutation `sourcedExitMatches.length > 0` → `> 1` survives. Every new test sources tiers that span several matches. Take a follow-up that takes the exits of a single match, such as the loser of losers finals in a non-grouped double elimination bracket: with this mutant it could never start early, and the new feature would silently not work for it.

**Suggestion**: Add a test in which the follow-up sources a tier that only one match produces. Decide that match while the rest of the bracket (e.g. grand finals) is still unplayed, and assert that the follow-up can be started.

## 3. [abstraction] `isDecided` reimplements the engine's `isMatchCompleted`

`app/features/tournament-bracket/core/Bracket/Bracket.ts:828` — info

`isMatchCompleted` in `app/features/tournament-bracket/core/engine/status.ts:46` (`isMatchByeCompleted(match) || Boolean(match.winnerSide)`) treats every case the same way as `isDecided`: BYE vs team, BYE vs BYE, BYE vs TBD and a set `winnerSide`. `MatchData` extends `MatchResults`, so it type-checks. Keeping two definitions of "decided match" lets them drift apart.

**Suggestion**: Delete `isDecided` and use `sourcedExitMatches.every(isMatchCompleted)`. Keep `winnerSideOf` only for `exitTierByTeamId`, which needs the winning side. This also removes the `isDecided` survivors from finding 1.
