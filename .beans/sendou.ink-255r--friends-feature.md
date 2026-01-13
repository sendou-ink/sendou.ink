---
# sendou.ink-255r
title: Friends feature
status: todo
type: epic
priority: normal
created_at: 2026-01-11T09:27:40Z
updated_at: 2026-01-13T09:31:29Z
---

## Overview

Friends functionality for sendou.ink, replacing the current "Trusted" system. Enables users to see their friends in one place and quickly find what they're looking for (SendouQ group, tournament).

## Core Concepts

### Relationship Model
- **Mutual friendship**: User A sends request → User B accepts → both are friends
- **Friends = Trusted**: Friendship automatically grants all current trust permissions (quick-add to groups, scrim pickups)
- **Soft limit**: ~200 friends maximum per user

### Display Priority Hierarchy
The sidebar and /friends page show users from multiple relationship sources, prioritized as:

1. **Explicit friends** (highest priority) - Users you've mutually friended
2. **Team members** - Members of teams you belong to
3. **Shared association members** (lowest priority) - Members of organizations/associations you share, including Plus server members

Within each tier, users with activity (SendouQ/tournaments) are shown first.

### Activity Visibility
- SendouQ group status (group count like "2/4")
- Tournament registration/participation
- No online/last seen tracking - just activities
- All connections see your activity (no privacy controls for MVP)

### Permission Model
- **Trusted permissions** (quick-add to groups without invite): Friends only
- **Quick invite** (send invite notification): All connections (friends, teammates, associations)
- Teammates and association members receive invite and must accept

### Migration from Trust System
- If A trusts B AND B trusts A → auto-create friendship
- One-way trust relationships → deleted
- TrustRelationship table eventually deprecated

## Features

### Friend Requests
- Send from: user profile page, invite link join flow (checkbox like current trust)
- Notifications: in-app only (notification bell/dropdown)
- States: pending outgoing, pending incoming, accepted, declined

### Sidebar Display
- Mixed list (no grouping by relationship type)
- Quota system: X slots for SendouQ activity, Y slots for tournament activity
- Priority: explicit friends → team members → association members
- Within each tier: active first, then most recent interaction
- Each entry shows: avatar, name, activity subtitle, badge
- "See all" link to /friends page

### /friends Page
- **Grouped sections** with headers (unlike sidebar)
- **Pending requests section**: incoming and outgoing requests
- **Friends section**: explicit friends with activity status
- **Teammates section**: team members (with team name context)
- **Connections section**: association/Plus members
- **Management**: unfriend, search/filter across all sections
- **Mutual friends**: show mutual friends count/list on profiles

### Quick Invite to SendouQ
- "Invite friend" button in SendouQ group lobby
- Can invite any connection (friends, teammates, associations)
- Sends notification to selected user(s)
- User can accept to join group directly
- Only friends can be directly added (trusted); others must accept invite

### Mutual Friends Display
- Show on user profiles
- Count of mutual friends
- Preview of mutual friend avatars/names

## Database Schema

### New Tables

```sql
-- Friendship (mutual relationship)
CREATE TABLE Friendship (
  // ...
);
-- Invariant: userOneId < userTwoId to prevent duplicates

-- Friend Request
CREATE TABLE FriendRequest (
  // ...
);

### Existing Tables Used
- `TeamMember` - for teammate relationships
- `AssociationMember` - for association members
- `PlusTier` - for Plus server membership

## Future Enhancements (out of scope)

- Private messaging between friends
- Friend activity feed (tournament placements, rank changes)
- Friend categories/groups
- Block list
- LFG status visible to friends
- Email notifications for friend requests
- Privacy controls per connection type
- Tournament team forming (see sendou.ink-5x6m)

## Completion Criteria

- [ ] Database schema and migrations created
- [ ] FriendRepository with all CRUD operations
- [ ] Friend request flow (send, accept, decline, cancel)
- [ ] Sidebar shows real friends/teammates/connections with activity
- [ ] /friends page with grouped sections and management
- [ ] Profile page friend button and mutual friends
- [ ] Quick invite to SendouQ group (all connections)
- [ ] Group invite accept/decline flow for non-friends
- [ ] Migration script for trust → friendship
- [ ] Update all trust-dependent features to use friendship
- [ ] Remove/deprecate TrustRelationship table
- [ ] Tests for friend operations
