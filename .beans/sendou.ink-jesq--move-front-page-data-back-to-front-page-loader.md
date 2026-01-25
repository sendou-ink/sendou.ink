---
# sendou.ink-jesq
title: Move front page data back to front page loader
status: todo
type: task
created_at: 2026-01-25T12:05:14Z
updated_at: 2026-01-25T12:05:14Z
parent: sendou.ink-6eko
---

The commit 131fa699f moved front page specific data loading (ShowcaseTournaments.frontPageTournamentsByUserId, changelog, leaderboards) into root.tsx loader as part of the sidenav rework.

This data should be moved back to the front page loader (_index route) since it's only needed there, not on every page load.

## Context
- Commit 131fa699f added this to root loader
- Data includes: tournaments, changelog, leaderboards
- Currently loaded via Promise.all in root loader
