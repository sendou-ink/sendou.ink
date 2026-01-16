---
# sendou.ink-ivaf
title: Friends section in sidebar with quick invite
status: todo
type: feature
created_at: 2026-01-16T10:17:54Z
updated_at: 2026-01-16T10:17:54Z
parent: sendou.ink-6eko
---

Integrate friends into the sidebar, enabling quick invites and friend status viewing.

**Related:** sendou.ink-255r (Friends feature epic)

## Features

### Quick Invite
- Users can send a "quick invite" to friends who have a partial SendouQ group that is currently looking for members
- The invite should be fast/easy to send directly from the sidebar

### Expandable Friend Details
When a user expands a friend entry in the sidebar, display:
- User avatar
- User name  
- Weapons (their current weapon pool or equipped weapons)
- Current group info (if they're in a SendouQ group)
- Any custom status text if available

For each of the friends groups' members

### Pending Requests Indicator
- Show pending requests somewhere visible in the UI

## Checklist

- [ ] Design UI for friends list in sidebar
- [ ] Add expand/collapse functionality for friend entries
- [ ] Display friend details (avatar, name, weapons, status text)
- [ ] Show current SendouQ group info for friends who are looking
- [ ] Implement quick invite button for friends with partial groups
- [ ] Add pending friend requests indicator
- [ ] Handle loading and empty states
