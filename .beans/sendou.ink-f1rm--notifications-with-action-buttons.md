---
# sendou.ink-f1rm
title: Notifications with action buttons
status: todo
type: task
created_at: 2026-01-13T10:13:18Z
updated_at: 2026-01-13T10:13:18Z
parent: sendou.ink-255r
---

## Overview

Extend the notification system to support inline action buttons. First use case: accept/decline friend requests directly from notification dropdown.

## Current State

Notifications are display-only - users must navigate to another page to take action.

## Requirements

### Generic Action Support
Notifications should support optional action buttons:
- Primary action (e.g., "Accept")
- Secondary action (e.g., "Decline")
- Actions trigger API calls without page navigation
- Notification updates/dismisses after action

### Friend Request Actions
First implementation:
- Friend request notification shows "Accept" and "Decline" buttons
- Accept → creates friendship, dismisses notification
- Decline → deletes request, dismisses notification

## Database Changes

Extend notification schema (if needed):
```sql
-- Option A: Store action metadata in notification
ALTER TABLE Notification ADD COLUMN actionType TEXT;
ALTER TABLE Notification ADD COLUMN actionData TEXT; -- JSON

-- Option B: Derive actions from notification type
-- No schema change, handle in code based on notification type
```

## UI Components

### NotificationItem
- Conditionally render action buttons based on notification type
- Loading state during action
- Success/error feedback
- Optimistic UI update

### Action Types (extensible)
```typescript
type NotificationAction = {
  type: "FRIEND_REQUEST";
  actions: ["accept", "decline"];
} | 
// not part of this task, but for future can also be group_invite etc.
{
  type: "GROUP_INVITE";
  actions: ["accept", "decline"];
} // ... future types
```

## API

New /notifications actions route.

## Future Use Cases

- Group invites (accept/decline)
- Tournament team invites
- Match ready check
- Scrim requests

## Checklist

- [ ] Design notification action data model
- [ ] Update NotificationItem component with action buttons
- [ ] Action API endpoint or reuse existing endpoints
- [ ] Loading/success/error states
- [ ] Implement for friend requests
- [ ] Update notification after action (dismiss or mark complete)
- [ ] Mobile-friendly action buttons
- [ ] Tests for notification actions
