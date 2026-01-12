---
# sendou.ink-r6ry
title: Streams integration in sidebar
status: todo
type: epic
priority: normal
created_at: 2026-01-11T09:18:00Z
updated_at: 2026-01-12T08:49:38Z
---

Unified streams experience across sendou.ink - displaying live and upcoming Splatoon community streams in the sidebar, mobile menu, and a dedicated /streams page.

## Goals

1. Surface live community streams prominently in the sidebar/mobile menu
2. Create a central `/streams` page for browsing all current and upcoming streams
3. Unify SendouQ, tournament, and community event streams under one system
4. Deprecate fragmented stream pages (`/q/streams`, `/to/:id/streams`)

## Stream Sources

### 1. SendouQ Matches
- Players in active SendouQ matches who are streaming
- Scoring based on tier/peak XP
- Already implemented in `/app/features/sendouq-streams/`

### 2. Tournament Matches
- Players/casters streaming tournament matches
- Scoring based on tournament prestige (separate epic) + round progression
- Round names should be visible (e.g., "Top 8", "Grand Finals")
- Streams of the same match should be visually grouped
- Already partially implemented in `/app/features/tournament/core/streams.server.ts`

### 3. Calendar Event Streams (New)
- External events (e.g., LANs) not hosted on sendou.ink
- Requires new `STREAM_CURATOR` role (granted by staff)
- Curators can only add stream links to events they created
- Stream links are platform-agnostic URLs (Twitch, YouTube, etc.)
- New CalendarEventStream join table for multiple links per event

### 4. Non-Match Streamers
- Players streaming Splatoon but not in SQ/tournament
- Must have X rank account linked
- Sorted by peak XP

## Sidebar & Mobile Menu

### Display
- Show top 3 streams (constant, easy to change later)
- Use existing SideNavLink format:
  - Image (thumbnail/logo)
  - Name (tournament/streamer name)
  - Subtitle (round name, or scheduled time for upcoming)
  - Badge ("LIVE" indicator)
- Link to `/streams` page

### Scoring Algorithm
- Skill-based ranking only (no viewer count)
- Configurable weights for easy tuning:
  - Tournament: prestige score + round progression bonus (fallback: team count tiers)
  - SendouQ: tier/peak XP
  - Calendar events: Fixed score (simple for now)
  - Non-match streamers: peak XP
- Daily shuffle with bias toward higher score
  - Seeded random by date so order is consistent for the day
  - Higher scores weighted more heavily but lower scores still have chance to appear

### Update Strategy
- Separate task exists for defining sidebar data update strategy (sendou.ink-wn5o)

## /streams Page

### Layout
- Two sections: Current/Live streams and Upcoming streams
- Desktop: potentially two-column layout (TBD in design phase)
- Option to view merged list or grouped by source (SQ/Tournaments/Events)

### Current/Live Section
- All active streams from all sources
- Tournament streams sorted by round, grouped by match
- Multiple tournaments interleaved by prestige/round score

### Upcoming Section
- Calendar events with attached stream info
- Tournaments with known start times
- Future: scheduled league matches

### Twitch Embeds
- Clicking a stream expands inline embed (accordion style)
- Multiple embeds can be open simultaneously
- Optional chat toggle alongside video

## Deprecations (Same Release)

### /q/streams
- Redirect to `/streams?source=sendouq`
- Remove link from `/q/looking` page

### /to/:id/streams
- Redirect to `/streams?tournament=:id` (or similar filter)
- Tournament bracket LIVE popovers retain current behavior (no change)

## New Permissions

### STREAM_CURATOR Role
- New role in existing permissions system
- Granted by staff (same flow as "is artist" role)
- Allows adding stream links to calendar events user created
- Scoped to own events only
- Database: `isStreamCurator` boolean column on User table

## Dependencies

- **sendou.ink-ylq5 - Tournament Prestige System**: Algorithm for calculating tournament prestige based on registered players' seeding power. Streams epic can start with simple heuristics (e.g., team count tiers) until prestige system is built. (soft dependency - can proceed without)

## Data Model Changes

### New Table: CalendarEventStream
- Join table for calendar event stream links
- Columns: id, calendarEventId, url
- Supports multiple stream links per event (Twitch, YouTube, etc.)

### User Table
- Add `isStreamCurator` boolean column (like `isArtist`)

## Technical Notes

### Existing Infrastructure
- Twitch API integration exists (`/app/modules/twitch/`)
- Stream caching with 2-min cache, 10-min stale-while-revalidate
- SendouQ streams logic in `/app/features/sendouq-streams/`
- Tournament streams logic in `/app/features/tournament/core/streams.server.ts`

### Sidebar Integration
- Current mock data in `/app/features/sidebar/routes/sidebar.ts`
- Replace `getMockStreams()` with real stream aggregation

## Open Questions (To Resolve During Implementation)

1. ~~Calendar event stream scoring weight~~ → Fixed score (resolved)
2. Exact layout for /streams page (start simple, iterate)
3. Visual design for tournament match grouping
4. Round ordering: progression order (R1→Finals) or reverse (Finals first)?
5. Cross-tournament interleaving vs grouping by tournament

## Child Tasks

All child tasks have been created as separate tickets under this epic:

- sendou.ink-9cpl: Create /streams page route and basic layout
- sendou.ink-nw8b: Implement stream aggregation service
- sendou.ink-js3r: Implement sidebar scoring algorithm
- sendou.ink-4m0t: Add STREAM_CURATOR role to permissions
- sendou.ink-a9gl: Add Twitch channel field to CalendarEvent
- sendou.ink-x535: Add stream curator UI for calendar events
- sendou.ink-r717: Implement Twitch embed component with chat toggle
- sendou.ink-kph0: Deprecate /q/streams with redirect
- sendou.ink-u6b2: Deprecate /to/:id/streams with redirect
- sendou.ink-hw3x: Update sidebar to use real stream data
- sendou.ink-ae15: Add /streams link to sidebar and mobile menu
