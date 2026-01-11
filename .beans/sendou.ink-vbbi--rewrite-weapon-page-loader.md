---
# sendou.ink-vbbi
title: Rewrite weapon page loader
status: todo
type: task
created_at: 2026-01-11T12:22:54Z
updated_at: 2026-01-11T12:22:54Z
parent: sendou.ink-0ze4
---

## Summary

Rewrite the loader for `/weapons/:slug` to fetch all data needed for the new weapon page.

## Data to Fetch

All in a single loader:

1. **Weapon info** - ID, name, slug, category (existing)
2. **Weapon params** - From JSON files, including patch history
3. **Category weapons** - All weapons in same category for comparison table
4. **Top XP holder** - From `weaponXPLeaderboard(weaponId)`
5. **Popularity stats** - Overall rank + category rank from XRankPlacement
6. **Recent vods** - 5 most recent from `VodRepository.findVods()`
7. **Popular builds** - 5 most popular from BuildRepository
8. **Art by tag** - 5 art pieces tagged with weapon slug

## Location

`/app/features/weapons/loaders/weapons.$slug.server.ts`

## Technical Notes

- Use Promise.all for parallel DB queries where possible
- Consider caching for expensive queries
- Handle missing data gracefully (e.g., no art tagged yet)