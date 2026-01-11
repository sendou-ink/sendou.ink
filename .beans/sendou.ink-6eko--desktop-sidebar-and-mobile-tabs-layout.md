---
# sendou.ink-6eko
title: Desktop sidebar and mobile tabs layout
status: in-progress
type: epic
priority: normal
created_at: 2026-01-11T08:58:29Z
updated_at: 2026-01-11T09:19:14Z
---

## Why

The previous layout had several limitations holding back the player experience:

1. **Poor mobile UX** - Navigation wasn't optimized for mobile players
2. **Hard to navigate** - No global search, sidebar only appeared on front page making it difficult to find features
3. **Slow path to matches** - Competitive players had too many clicks to join matches or check their tournament status
4. **No foundation for scheduling** - Future features like team scheduling and league match scheduling need a persistent navigation structure
5. **Streams not visible** - Community streams weren't highlighted, missing opportunity to showcase active players

## Goals

- Make it easy for competitive players to get into matches fast (1-click access to active matches/tournaments)
- Provide persistent navigation across all pages via sidebar (desktop) and bottom tabs (mobile)
- Add global search via command palette to quickly find users, teams, organizations, and tournaments
- Lay foundation for upcoming features: friend group quick-join, team scheduling, league scheduling
- Better highlight community content like streams

## What's been built

- **Desktop**: Fixed sidebar with user profile, tournament calendar, friends list, streams + top menu bar with category dropdowns
- **Mobile**: Bottom tab bar with modal panels for menu, friends, tournaments, and user profile
- **Command palette**: Global search (Cmd/Ctrl+K) for users, teams, organizations, tournaments
- **Breadcrumb navigation**: Context-aware page hierarchy
- **Quick match access**: Tournament and SendouQ match status prominently displayed

## Completion criteria

All child tickets resolved.