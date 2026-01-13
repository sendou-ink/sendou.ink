---
# sendou.ink-3k3u
title: Friend request API routes
status: todo
type: task
priority: normal
created_at: 2026-01-13T09:32:19Z
updated_at: 2026-01-13T10:18:25Z
parent: sendou.ink-255r
blocking:
    - sendou.ink-f1rm
---

## Overview

Implement action handlers for friend request operations following the codebase's action pattern.

## File

`app/features/friends/actions/friends.ts` (same route as /friends page)

## Action Pattern

Uses `_action` field in form submissions with switch case:

```typescript
export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);
  const data = await parseRequestPayload({ request });

  switch (data._action) {
    case "SEND_REQUEST": {
      // Send friend request
      // Validate: not already friends, no pending request, under limit
      // Create FriendRequest record
      // Create notification for receiver
      return json({ success: true });
    }
    case "ACCEPT_REQUEST": {
      // Accept incoming friend request
      // Validate: request exists, user is receiver
      // Delete FriendRequest, create Friendship
      // Create notification for sender
      return json({ success: true });
    }
    case "DECLINE_REQUEST": {
      // Decline incoming friend request
      // Validate: request exists, user is receiver
      // Delete FriendRequest
      return json({ success: true });
    }
    case "CANCEL_REQUEST": {
      // Cancel outgoing friend request
      // Validate: request exists, user is sender
      // Delete FriendRequest
      return json({ success: true });
    }
    case "UNFRIEND": {
      // Remove friendship
      // Validate: friendship exists
      // Delete Friendship record
      return json({ success: true });
    }
    default:
      throw new Response("Invalid action", { status: 400 });
  }
};
```

## Form Data

```typescript
// SEND_REQUEST
{ _action: "SEND_REQUEST", targetUserId: number }

// ACCEPT_REQUEST
{ _action: "ACCEPT_REQUEST", requestId: number }
// or
{ _action: "ACCEPT_REQUEST", senderId: number }

// DECLINE_REQUEST
{ _action: "DECLINE_REQUEST", requestId: number }

// CANCEL_REQUEST
{ _action: "CANCEL_REQUEST", requestId: number }

// UNFRIEND
{ _action: "UNFRIEND", friendId: number }
```

## Validation

- `SEND_REQUEST`: 
  - Target user exists
  - Not already friends
  - No pending request in either direction
  - Sender under friend limit (~200)
  
- `ACCEPT_REQUEST`:
  - Request exists
  - Current user is the receiver
  - Both users under friend limit
  
- `UNFRIEND`:
  - Friendship exists
  - Current user is part of the friendship

## Notifications

- `SEND_REQUEST` → notify receiver "X sent you a friend request"
- `ACCEPT_REQUEST` → notify original sender "X accepted your friend request"

## Checklist

- [ ] Add action handler to friends.tsx
- [ ] SEND_REQUEST action with validation
- [ ] ACCEPT_REQUEST action
- [ ] DECLINE_REQUEST action
- [ ] CANCEL_REQUEST action
- [ ] UNFRIEND action
- [ ] Integration with notification system
- [ ] Error handling and user feedback
- [ ] Tests for each action
