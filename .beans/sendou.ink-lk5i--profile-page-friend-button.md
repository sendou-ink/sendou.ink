---
# sendou.ink-lk5i
title: Profile page friend button
status: todo
type: task
created_at: 2026-01-13T09:32:51Z
updated_at: 2026-01-13T09:32:51Z
parent: sendou.ink-255r
---

## Overview

Add friend request button to user profile pages. IMPORTANT need to be added both to the old user profile and new user profile (widget based).

## Location

`app/features/user-page/routes/u.$identifier.tsx` (or similar profile route)

## States

Button shows different states based on relationship:
1. **Not friends, no request**: "Add Friend" button → sends request
2. **Outgoing request pending**: "Request Sent" (disabled or cancel option)
3. **Incoming request pending**: "Accept Request" / "Decline" buttons
4. **Already friends**: "Friends ✓" with unfriend option in dropdown

## Implementation

- Check friendship status in loader
- Check pending requests in both directions
- Action handler for send/accept/decline/unfriend

## Checklist

- [ ] Add friendship status to profile loader
- [ ] Friend button component with all states
- [ ] Action handlers for friend operations
- [ ] Loading states during actions
- [ ] Success/error feedback
