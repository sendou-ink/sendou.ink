---
# sendou.ink-bti2
title: Fix duplicate Notifications header in mobile user tab
status: todo
type: bug
created_at: 2026-01-11T09:39:53Z
updated_at: 2026-01-11T09:39:53Z
parent: sendou.ink-6eko
---

## Problem

On mobile, the user tab modal shows the "Notifications" header twice in a row - once as a section header and again immediately below it with a refresh button.

## Screenshot

The "You" modal displays:
- User profile (Sendou)
- 🔔 Notifications (first instance)
- 🔔 Notifications + refresh button (second instance)
- Notification list items

## Expected behavior

The Notifications header should only appear once.

## Acceptance criteria

- Only one Notifications header is displayed in the mobile user tab
- Refresh functionality is preserved
- Layout remains clean and properly structured