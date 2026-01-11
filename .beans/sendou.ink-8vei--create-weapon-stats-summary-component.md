---
# sendou.ink-8vei
title: Create weapon stats summary component
status: todo
type: task
created_at: 2026-01-11T12:22:34Z
updated_at: 2026-01-11T12:22:34Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays weapon leaderboard and popularity statistics.

## Features

- **Top XP holder** - Player name + XP value, links to full leaderboard
- **Popularity stats** - Top 500 appearances shown in two contexts:
  - Overall rank across all weapons
  - Rank within the weapon's category

## Data Sources

- XP data: `XPLeaderboard.server.ts` - `weaponXPLeaderboard(weaponId)`
- Popularity: `XRankPlacement` table queries

## Props

- `topPlayer` - { name, xp, playerId }
- `popularity` - { overallRank, categoryRank, appearances }
- `weaponId` - for leaderboard link

## Technical Notes

- Use existing player link components if available
- Leaderboard link goes to `/leaderboards?type=XP-WEAPON-{weaponId}`
- Caching for performance?
