---
# sendou.ink-9cpl
title: Create /streams page route and basic layout
status: todo
type: feature
priority: normal
created_at: 2026-01-12T09:19:55Z
updated_at: 2026-01-12T12:07:16Z
parent: sendou.ink-r6ry
blocking:
    - sendou.ink-kph0
    - sendou.ink-u6b2
    - sendou.ink-ae15
---

Create the new /streams page that will serve as the central hub for all community streams.

## Requirements

- Add route at /streams
- Two-section layout: Live streams and Upcoming streams
- Desktop: Single column (can iterate on two-column later)
- Mobile: Single column stacked layout
- Support query params for filtering

## Query Params

- `?source=sendouq` - Filter to only SendouQ streams
- `?source=tournament` - Filter to only tournament streams
- `?tournament=:id` - Filter to specific tournament (for redirect from `/to/:id/streams`)

## Checklist

- [ ] Add route to `routes.ts`: `route("/streams", "features/streams/routes/streams.tsx")`
- [ ] Create `/app/features/streams/routes/streams.tsx`
- [ ] Create loader that calls aggregation service
- [ ] Create stream card component
- [ ] Implement "Live" section with live streams
- [ ] Implement "Upcoming" section with upcoming calendar events
- [ ] Add empty state for when no streams are live
- [ ] Add filter tabs/dropdown for source filtering
- [ ] Add i18n translations

## Stream Card Design

Each stream card should show:
- Thumbnail/avatar image
- Stream title or streamer name
- Source indicator (SendouQ badge, Tournament name, Event name)
- Subtitle (round name, match info, scheduled time)
- LIVE badge or scheduled time
- Click to expand Twitch embed (if Twitch)
- External link for non-Twitch streams

## Empty State

When no streams are live:
- Show friendly message: "No live streams right now"
- Show upcoming streams section more prominently
- Consider showing recent VODs (future enhancement)

## Implementation Notes

- Create in `/app/features/streams/` folder
- Loader calls aggregation service (sendou.ink-nw8b)
- Twitch streams can embed inline (sendou.ink-r717)
- Non-Twitch streams (YouTube, etc.) open in new tab

## Dependencies

- sendou.ink-nw8b: Stream aggregation service (for data)
- sendou.ink-r717: Twitch embed component (for playback)
