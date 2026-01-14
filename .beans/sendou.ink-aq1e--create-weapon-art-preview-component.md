---
# sendou.ink-aq1e
title: Create weapon art preview component
status: completed
type: task
priority: normal
created_at: 2026-01-11T12:22:54Z
updated_at: 2026-01-14T13:48:27Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays 5 art pieces tagged with the weapon.

## Features

- Show 5 art pieces tagged with the weapon's slug
- Each art shows: thumbnail, artist name
- "View all" link to art page filtered by weapon tag

## Data Source

- `ArtRepository` with tag filter
- Tag = weapon slug (canonical tag, e.g., "splattershot-jr")

## Props

- `artPieces` - array of 5 art objects
- `weaponSlug` - for tag filtering and "view all" link

## Technical Notes

- Art uses existing tag system - weapon slug is the canonical tag
- Reuse existing art display components if available