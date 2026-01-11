---
# sendou.ink-sb5p
title: Create recent vods preview component
status: todo
type: task
created_at: 2026-01-11T12:22:34Z
updated_at: 2026-01-11T12:22:34Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays 5 recent VODs for a weapon.

## Features

- Show 5 most recent VODs featuring the weapon
- Each VOD shows: thumbnail, title, date, player(s)
- "View all" link to `/vods?weapon={weaponId}`

## Data Source

- `VodRepository.findVods()` with weapon filter
- Includes alt skins/kits via `weaponIdToArrayWithAlts()`

## Props

- `vods` - array of 5 vod objects
- `weaponId` - for "view all" link

## Technical Notes

- Reuse existing VOD display components if available (`VodListing`)
