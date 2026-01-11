---
# sendou.ink-0q9m
title: My calendar page and components
status: todo
type: task
created_at: 2026-01-11T11:45:35Z
updated_at: 2026-01-11T11:45:35Z
parent: sendou.ink-om3i
---

## Summary

Build the `/my-calendar` page with list view and event card components.

## Details

**Page requirements:**
- Route: `/my-calendar`
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
- Build components that can be reused by sidebar My Calendar section
- Handle both tournament and scrim event types

## Checklist

- [ ] Add route to routes.ts
- [ ] Create page component with loader
- [ ] Create event list component (grouped by day)
- [ ] Create event card component (handles tournament + scrim)
- [ ] Implement empty state with links
- [ ] Add translations
- [ ] Style with CSS modules