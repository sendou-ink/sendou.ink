---
# sendou.ink-nw8b
title: Implement stream aggregation service
status: todo
type: feature
priority: normal
created_at: 2026-01-12T09:20:06Z
updated_at: 2026-01-12T09:21:32Z
parent: sendou.ink-r6ry
blocking:
    - sendou.ink-hw3x
---

Create a unified service that combines streams from all sources into a single sorted list.

## Stream Sources

### 1. SendouQ matches
- Players in active matches who are streaming
- Existing: `/app/features/sendouq-streams/core/streams.server.ts`
- Reuse `streamedMatches()` function

### 2. Tournament matches
- Players/casters streaming tournament matches
- Existing: `/app/features/tournament/core/streams.server.ts`
- Reuse `streamsByTournamentId()` function
- Include round name (e.g., 'Top 8', 'Grand Finals')
- Group streams of the same match together

### 3. Calendar event streams (new)
- External events with curator-added stream links
- Query CalendarEventStream table for upcoming events
- These are just URLs - may not be live (display "Upcoming" not "LIVE")
- Soft dependency on sendou.ink-a9gl (can skip if not done yet)

### 4. Non-match streamers (new)
- Players streaming Splatoon 3 but NOT in SQ/tournament matches
- **Must have X rank account linked** (SplatoonPlayer with userId set)
- Sorted by peak XP from X rank data
- Filter out anyone already appearing in sources 1-2

## Output Type

```typescript
interface AggregatedStream {
  id: string;                      // Unique identifier
  name: string;                    // Display name
  imageUrl: string;                // Thumbnail or avatar
  subtitle: string;                // Round name, scheduled time, etc.
  badge?: "LIVE" | "UPCOMING";     // Status badge
  source: "sendouq" | "tournament" | "calendar" | "general";
  score: number;                   // For sorting (from scoring algorithm)
  url: string;                     // Link to stream
  twitchUsername?: string;         // For Twitch embeds
}
```

## Checklist

- [ ] Create `/app/features/streams/` folder structure
- [ ] Create `aggregateStreams()` main function in `streams.server.ts`
- [ ] Implement SendouQ source adapter
- [ ] Implement Tournament source adapter
- [ ] Implement Calendar event source adapter (can be empty initially)
- [ ] Implement non-match streamers source (users with X rank + Twitch, currently streaming Splatoon 3)
- [ ] Add type definitions
- [ ] Add caching strategy (reuse Twitch's 2min cache pattern)

## Implementation Notes

- Create in `/app/features/streams/` (new feature folder)
- Reuse existing Twitch caching via `/app/modules/twitch/`
- Call existing stream functions, don't duplicate Twitch API logic
- Non-match streamers query pattern:
  1. Get all Splatoon 3 streams from Twitch API
  2. Get users with `twitchUsername` AND linked `SplatoonPlayer` (X rank data)
  3. Match streams to users
  4. Filter out those already in SQ/tournament streams
  5. Sort by peak XP
