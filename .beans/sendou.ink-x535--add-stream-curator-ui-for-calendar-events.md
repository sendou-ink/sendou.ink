---
# sendou.ink-x535
title: Add stream curator UI for calendar events
status: todo
type: feature
created_at: 2026-01-12T09:20:31Z
updated_at: 2026-01-12T09:20:31Z
parent: sendou.ink-r6ry
---

Create UI for stream curators to add stream links to their calendar events.

## Requirements

- Only visible to users with STREAM_CURATOR role
- Only editable for events the user created
- Allow adding/removing stream URL(s)
- Basic URL format validation
- Support any streaming platform (Twitch, YouTube, etc.)

## UI Location

- Calendar event edit page: `/app/features/calendar/routes/calendar.new.tsx`
- (Same page handles both create and edit via `eventId` param)
- New section: "Stream Links" or "Streams"

## UI Design

```
## Streams (only visible to STREAM_CURATOR + event owner)

[ https://twitch.tv/example    ] [Remove]
[ https://youtube.com/watch?v= ] [Remove]
[+ Add stream link]

Max 5 links per event
```

## Checklist

- [ ] Add `useHasRole("STREAM_CURATOR")` check in calendar.new.tsx
- [ ] Create "Streams" section in the form (only for edit mode, not create)
- [ ] Add URL input with add/remove functionality
- [ ] Add action handler for saving stream links
- [ ] Show existing stream links when editing
- [ ] Add i18n translations for labels

## Implementation Notes

- Use existing form patterns from the calendar edit page
- Stream links are saved separately from main event data
- Only show section in edit mode (after event is created)
- Consider showing platform icon based on URL (Twitch, YouTube, etc.)

## Dependencies

- sendou.ink-4m0t: STREAM_CURATOR role
- sendou.ink-a9gl: CalendarEventStream table
