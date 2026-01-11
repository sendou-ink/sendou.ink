---
# sendou.ink-1qfh
title: Fix notification button and indicator dot overlay
status: scrapped
type: bug
priority: normal
created_at: 2026-01-11T09:37:03Z
updated_at: 2026-01-11T12:53:25Z
parent: sendou.ink-6eko
---

## Problem

The notification bell icon and the unread indicator dot are displayed side by side instead of the dot being overlayed on top of the bell icon.

## Screenshot

The blue notification dot appears next to the bell icon rather than positioned as an overlay badge on the icon.

## Expected behavior

The notification indicator dot should be positioned as an overlay on the bell icon (typically top-right corner), following standard notification badge UI patterns.

## Acceptance criteria

- Notification dot is positioned as an overlay on the bell icon
- Dot placement follows common UI conventions (e.g., top-right corner)
- Works correctly on both desktop sidebar and mobile layouts