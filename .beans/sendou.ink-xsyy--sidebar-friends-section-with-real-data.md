---
# sendou.ink-xsyy
title: Sidebar friends section with real data
status: in-progress
type: task
priority: normal
created_at: 2026-01-13T09:32:29Z
updated_at: 2026-01-16T08:04:13Z
parent: sendou.ink-255r
---

## Overview

Replace mocked friends in sidebar with real data from friends, teammates, and associations.

## Current State

`app/features/sidebar/routes/sidebar.ts` returns mock friends when user is authenticated.

## Requirements

### Data Source
Query from FriendRepository.findAllConnectionsWithActivity(userId) which returns:
- Explicit friends
- Team members
- Association/Plus members

### Display Priority
1. Users with SendouQ activity (quota: ~3 slots)
2. Users with tournament activity (quota: ~2 slots)
3. Most recently interacted friends
4. Then teammates, then associations

### Item Display
Each item shows:
- Avatar
- Username
- Activity subtitle ("SendouQ", tournament name, team name)
- Badge ("2/4" for group count, "LIVE" for tournament match)

### Mixed List
No grouping by relationship type in sidebar (mixed list with priority ordering).

## Checklist

- [x] Update sidebar loader to fetch real connections
- [x] Implement basic priority sorting (SendouQ first, then tournament subs)
- [x] Update SideNavFriendItem component with real data (URLs, avatars)
- [ ] Full priority sorting logic with quota system
- [ ] "See all" link to /friends page
- [ ] Handle empty state (no friends yet)