---
# sendou.ink-a9gl
title: Add stream links field to CalendarEvent
status: todo
type: task
priority: normal
created_at: 2026-01-12T09:20:30Z
updated_at: 2026-01-12T09:21:32Z
parent: sendou.ink-r6ry
blocking:
    - sendou.ink-x535
---

Add database table for storing stream links associated with calendar events.

## Requirements

- Support multiple stream links per event (Twitch, YouTube, etc.)
- Links are just URLs - platform-agnostic
- Only STREAM_CURATOR users can add links to their own events

## Data Model

New join table `CalendarEventStream`:

| Column | Type | Description |
|--------|------|-------------|
| id | number | Primary key |
| calendarEventId | number | FK to CalendarEvent |
| url | string | Full URL to stream (e.g., `https://twitch.tv/username`) |

## Checklist

- [ ] Create migration `0XXX-calendar-event-stream.ts` with CalendarEventStream table
- [ ] Add `CalendarEventStream` interface to `/app/db/tables.ts`
- [ ] Add TypeScript types in calendar feature types file
- [ ] Create repository functions: `addStreamToEvent`, `removeStreamFromEvent`, `getStreamsForEvent`

## Implementation Notes

- Keep it simple: just store the URL as-is
- No validation against external APIs (just basic URL format check)
- Display can extract platform from URL (twitch.tv, youtube.com, etc.) if needed for icon
- First version only support Twitch and YouTube links/embeds, might be expanded later (so store the full stream URL to the DB)
- Max links per event: consider a reasonable limit (e.g., 5)
