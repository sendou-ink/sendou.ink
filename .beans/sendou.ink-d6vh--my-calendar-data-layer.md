---
# sendou.ink-d6vh
title: My Events data layer
status: todo
type: task
priority: normal
created_at: 2026-01-11T11:45:35Z
updated_at: 2026-01-11T12:51:07Z
parent: sendou.ink-om3i
---

## Summary

Create the data fetching layer for the My Events page that combines tournaments and scrims into a unified event list.

## Details

**Data sources to combine:**
- Tournaments user is registered for
- Tournaments user is organizing
- Scrims with scheduled matches
- Scrims in looking-for-match state

**Output:**
- Single sorted list of events (chronological)
- Each event needs: name, time, status, type (tournament/scrim)
- Tournament events need: check-in window info, handle two-day tournaments
- Filter to upcoming events only (no past)

## Technical approach

- Create loader at `/my-events` route
- Repository functions to fetch user tournaments and scrims
- Merge and sort by start time
- Design data structure that works for both page and sidebar (shared)

## Checklist

- [ ] Create repository function for user's upcoming tournaments
- [ ] Create repository function for user's upcoming scrims
- [ ] Create unified event type/interface
- [ ] Create loader that combines and sorts events
- [ ] Verify data structure works for sidebar consumption