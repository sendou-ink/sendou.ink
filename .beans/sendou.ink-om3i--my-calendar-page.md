---
# sendou.ink-om3i
title: My Events page
status: todo
type: epic
priority: normal
created_at: 2026-01-11T09:45:51Z
updated_at: 2026-01-11T12:50:40Z
---

## Summary

A dedicated page (`/my-events`) for viewing the user's personal events with all their upcoming commitments in one centralized view.

## Why

Users struggle to see all their commitments (tournaments, scrims) in one place. While the sidebar shows a quick glance, players need a full page view to see their complete schedule.

## Scope (Initial)

**Must have:**
- Tournaments user is registered for
- Tournaments user is organizing
- Scrims (scheduled matches)
- Scrims (looking-for-match posts)

**Future consideration:**
- SendouQ sessions
- Team practice times
- External calendar integration (Google, etc.)

## Design

**View format:** Simple list view, grouped by day (chronological)

**Event card info:**
- Name (tournament name or scrim opponent)
- Time
- Status
- Check-in window (for tournaments, e.g. "Check-in opens in 2 hours")
- Handle two-day tournaments appropriately

**Time range:** All upcoming events only, no past events

**Interaction:** Clicking an event navigates directly to the tournament/scrim page

**URL:** `/my-events` (login required)

**Empty state:** Simple message ("No upcoming events") with links to /calendar and /scrims

**iCal export:** Support .ics file export for subscribing in external calendars (similar to existing /calendar feature)

## Technical Notes

- Share components and data fetching logic with sidebar "Events" section
- Related tasks: `sendou.ink-kw6u` (scrims in sidebar), `sendou.ink-1kb8` (times on mobile panel)

## Navigation

- Add link to sidebar (desktop)
- Add link to mobile menu

## Completion Criteria

All child tasks resolved.