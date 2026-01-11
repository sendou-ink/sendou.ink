---
# sendou.ink-1kb8
title: Show times on mobile Events panel
status: todo
type: task
priority: normal
tags:
    - my-events-epic
created_at: 2026-01-11T09:48:18Z
updated_at: 2026-01-11T12:51:46Z
parent: sendou.ink-6eko
---

## Summary

The mobile Events panel currently only shows tournament names without any time information. Add day headers and event times to help players know when things are happening.

## Current state

Panel shows a flat list of tournaments with just:
- Tournament logo
- Tournament name

## Proposed design

Group events by day with headers, then show time per event:

```
Today
  3:00 PM  PICNIC #2
  7:00 PM  In The Zone 22

Tomorrow  
  2:00 PM  Paddling Pool 253
  5:00 PM  Swim or Sink 101
```

## Checklist

- [ ] Add day header groupings (Today, Tomorrow, weekday names, or dates)
- [ ] Show event start time next to each entry
- [ ] Ensure times display in user's local timezone
- [ ] Test with events spanning multiple days