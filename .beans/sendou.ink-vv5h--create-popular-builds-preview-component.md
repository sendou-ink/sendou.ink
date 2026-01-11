---
# sendou.ink-vv5h
title: Create popular builds preview component
status: todo
type: task
created_at: 2026-01-11T12:22:34Z
updated_at: 2026-01-11T12:22:34Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays 5 popular builds for a weapon.

## Features

- Show 5 most popular builds for the weapon
- Each build shows: abilities, author, stats
- "View all" link to `/builds/{weaponSlug}/popular`

## Data Source

- `BuildRepository` queries for popular builds
- Existing popular builds logic in build-stats feature

## Props

- `builds` - array of 5 build objects
- `weaponSlug` - for "view all" link

## Technical Notes

- Reuse existing `BuildCard` component if suitable
- May need compact variant for preview display