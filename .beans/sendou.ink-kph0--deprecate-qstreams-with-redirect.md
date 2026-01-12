---
# sendou.ink-kph0
title: Deprecate /q/streams with redirect
status: todo
type: task
created_at: 2026-01-12T09:20:46Z
updated_at: 2026-01-12T09:20:46Z
parent: sendou.ink-r6ry
---

Remove the old /q/streams page and redirect to unified /streams page.

## Requirements

- Redirect /q/streams to /streams?source=sendouq
- Remove link from /q/looking page
- Keep redirect permanent (301)

## Files to Update

- /app/features/sendouq-streams/routes/q.streams.tsx - convert to redirect
- /app/features/sendouq/routes/q.looking.tsx - remove streams link
- routes.ts - may need route changes

## Notes

- Should be done in same release as /streams page launch
- Preserve any bookmarked URLs via redirect