---
# sendou.ink-0q9m
title: My Events page and components
status: todo
type: task
priority: normal
created_at: 2026-01-11T11:45:35Z
updated_at: 2026-01-11T12:50:56Z
parent: sendou.ink-om3i
---

## Summary

Build the `/my-events` page with list view and event card components.

## Details

**Page requirements:**
- Route: `/my-events`
- Login required (redirect if not authenticated)
- List view grouped by day (chronological)
- Empty state with links to /calendar and /scrims

**Event card info:**
- Name (tournament name or scrim opponent)
- Time
- Status
- Check-in window (for tournaments)
- Click navigates directly to tournament/scrim page

**Component sharing:**
- Build components that can be reused by sidebar Events section
- Handle both tournament and scrim event types

## Checklist

- [ ] Add route to routes.ts
- [ ] Create page component with loader
- [ ] Create event list component (grouped by day)
- [ ] Create event card component (handles tournament + scrim)
- [ ] Implement empty state with links
- [ ] Add translations
- [ ] Style with CSS modules