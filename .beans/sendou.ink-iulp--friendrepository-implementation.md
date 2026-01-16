---
# sendou.ink-iulp
title: FriendRepository implementation
status: in-progress
type: task
priority: normal
created_at: 2026-01-13T09:32:05Z
updated_at: 2026-01-16T07:59:43Z
parent: sendou.ink-255r
---

## Overview

Create repository for friend-related database operations.

## File

`app/features/friends/FriendRepository.server.ts`

## Functions

### Friendship CRUD
- `insert(userOneId, userTwoId)` - Create mutual friendship (ensure userOneId < userTwoId)
- `delete(userId, friendId)` - Remove friendship
- `findByUserId(userId)` - Get all friends for a user
- `findMutualFriends(userIdA, userIdB)` - Get mutual friends between two users

### Friend Requests
- `insert(senderId, receiverId)` - Send friend request
- `delete(senderId, receiverId)` - Cancel/decline request
- `findPendingForUser(userId)` - Get incoming requests
- `findOutgoingForUser(userId)` - Get outgoing requests
- `hasPendingRequest(senderId, receiverId)` - Check if request exists

### Connections (aggregated)
- `findAllConnectionsWithActivity(userId)` - Get friends, teammates, associations with SendouQ/tournament activity

## Checklist

- [x] Create FriendRepository.server.ts
- [x] Implement `findByUserIdWithActivity(userId)` for sidebar
- [ ] Implement friendship CRUD
- [ ] Implement friend request operations
- [ ] Unit tests for repository functions
