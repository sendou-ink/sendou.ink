---
# sendou.ink-rbyg
title: Mutual friends display
status: todo
type: task
created_at: 2026-01-13T09:32:58Z
updated_at: 2026-01-13T09:32:58Z
parent: sendou.ink-255r
---

## Overview

Show mutual friends on user profile pages.

## Display

On profile page, show:
- "X mutual friends" count
- Preview of 3-5 mutual friend avatars
- Click to expand/see full list

## Implementation

- `FriendRepository.findMutualFriends(viewerId, profileUserId)`
- Returns users who are friends with both
- Count and limited preview in loader
- Full list modal or expandable section

## Checklist

- [ ] Add mutual friends query to repository
- [ ] Add to profile page loader
- [ ] Mutual friends preview component
- [ ] Full list modal/expansion
- [ ] Handle zero mutual friends