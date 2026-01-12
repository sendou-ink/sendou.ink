---
# sendou.ink-u6b2
title: Deprecate /to/:id/streams with redirect
status: todo
type: task
priority: normal
created_at: 2026-01-12T09:20:46Z
updated_at: 2026-01-12T12:07:11Z
parent: sendou.ink-r6ry
---

Remove the old tournament streams page and redirect to unified /streams page.

## Requirements

- Redirect /to/:id/streams to /streams?tournament=:id (or similar filter)
- Tournament bracket LIVE popovers retain current behavior (no change)
- Keep redirect permanent (301)

## Files to Update

- /app/features/tournament/routes/to.$id.streams.tsx - convert to redirect
- routes.ts - may need route changes

## Notes

- Should be done in same release as /streams page launch
- Preserve any bookmarked URLs via redirect
- Bracket popover behavior is separate and unchanged