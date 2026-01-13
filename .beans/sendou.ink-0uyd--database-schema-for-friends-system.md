---
# sendou.ink-0uyd
title: Database schema for friends system
status: todo
type: task
priority: normal
created_at: 2026-01-13T09:31:56Z
updated_at: 2026-01-13T09:32:10Z
parent: sendou.ink-255r
blocking:
    - sendou.ink-iulp
---

## Overview

Create database migrations for the friends system tables.

## Tables to Create

### Friendship
```sql
CREATE TABLE Friendship (
  id INTEGER PRIMARY KEY,
  userOneId INTEGER NOT NULL REFERENCES User(id),
  userTwoId INTEGER NOT NULL REFERENCES User(id),
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(userOneId, userTwoId)
);
CREATE INDEX idx_friendship_user_one ON Friendship(userOneId);
CREATE INDEX idx_friendship_user_two ON Friendship(userTwoId);
```
Invariant: userOneId < userTwoId to prevent duplicate relationships.

### FriendRequest
```sql
CREATE TABLE FriendRequest (
  id INTEGER PRIMARY KEY,
  senderId INTEGER NOT NULL REFERENCES User(id),
  receiverId INTEGER NOT NULL REFERENCES User(id),
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(senderId, receiverId)
);
CREATE INDEX idx_friend_request_receiver ON FriendRequest(receiverId);
```

### SendouQ group changes

We also need to add support for invites in SQ without the user being in the queue. TBD what the table design looks like

## Checklist

- [ ] Create migration file
- [ ] Add tables to `app/db/tables.ts`
- [ ] Run migration and verify schema
- [ ] Add to test database
