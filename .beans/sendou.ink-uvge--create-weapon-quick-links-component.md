---
# sendou.ink-uvge
title: Create weapon quick links component
status: todo
type: task
created_at: 2026-01-11T12:22:54Z
updated_at: 2026-01-11T12:22:54Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays quick links to related pages.

## Links to Include

- **Builds** - `/builds/{weaponSlug}`
- **Popular Builds** - `/builds/{weaponSlug}/popular`
- **Ability Stats** - `/builds/{weaponSlug}/stats`
- **VODs** - `/vods?weapon={weaponId}`
- **Build Analyzer** - `/analyzer` (with weapon pre-selected if possible)
- **Object Damage Calculator** - `/object-damage-calculator`
- **Free Agents** - Link to SendouQ looking page filtered by weapon
- **Leaderboard** - `/leaderboards?type=XP-WEAPON-{weaponId}` (shown with top XP holder)

## Props

- `weaponSlug`
- `weaponId`

## Technical Notes

- Use existing `LinkButton` component
- Appropriate icons for each link (existing icons in codebase)
- Some links may be grouped with related features (e.g., leaderboard with stats summary)