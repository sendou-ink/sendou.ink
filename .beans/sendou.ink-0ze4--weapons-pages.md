---
# sendou.ink-0ze4
title: Weapons pages
status: draft
type: epic
created_at: 2026-01-11T12:10:47Z
updated_at: 2026-01-11T12:10:47Z
---

## Summary

Individual weapon pages (`/weapons/<weapon-slug>`) with comprehensive weapon data, stats, and links to related content.

## Data Source

Parse weapon parameters from https://github.com/Leanny/splat3 into a format easy to use within sendou.ink.

## Features

### Parameter Comparison Table

- **Rows** = parameters (raw keys from Leanny's data, supports translation that can be filled out over time)
- **Columns** = weapons in same category (e.g., Jr page shows all shooters)
- **Current weapon pinned** in the table for easy comparison
- **Patch history inline**: each cell shows current value + indicator if changed, expandable to see full history (which patch + date)

### Leaderboard & Popularity Stats

- **Top XP holder** for the weapon (name + XP) with link to full leaderboard
- **Popularity** (top 500 appearances) - shown both:
  - Overall across all weapons
  - Within the weapon's category
- Data already exists in sendou.ink database

### Rich Previews (5 items each)

- **5 recent vods** of the weapon
- **5 popular builds** for the weapon
- **5 art pieces** tagged by the weapon

### Simple Links

- Free agents using this weapon
- Build analyzer link
- Object damage calculator link

## Navigation

- No landing page at `/weapons`
- No category pages
- Users access individual weapon pages directly via menu (weapon mega menu)

## Technical Notes

- Individual weapon pages already exist as placeholders (e.g., `/weapons/splattershot-jr`)
- Leaderboard and popularity data already available in database