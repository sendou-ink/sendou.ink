---
# sendou.ink-m9lp
title: Friend checkbox on invite link join
status: todo
type: task
created_at: 2026-01-13T09:33:50Z
updated_at: 2026-01-13T09:33:50Z
parent: sendou.ink-255r
---

## Overview

Update the invite link join flow to offer friending instead of trusting.

## Current Flow

When joining SendouQ group or tournament team via invite link:
- Checkbox: "Trust [owner name]"
- If checked, creates TrustRelationship

## New Flow

- Checkbox: "Send friend request to [owner name]"
- If checked, creates FriendRequest (not immediate friendship)
- Or if they already sent you a request, accepts it (creates friendship)

## Files

- `app/features/sendouq/actions/q.server.ts` - JOIN_TEAM_WITH_TRUST action
- `app/features/tournament/actions/to.$id.join.server.ts` - Trust checkbox handling
- Related UI components for the join forms

## Behavior

1. If not friends and no pending request: create FriendRequest from joiner → owner
2. If pending request from owner → joiner: accept request, create Friendship
3. If already friends: no-op
4. Notification sent to owner

## Checklist

- [ ] Update SendouQ join action
- [ ] Update tournament join action
- [ ] Update checkbox labels (i18n)
- [ ] Handle mutual request → friendship case
- [ ] Tests for join flow
