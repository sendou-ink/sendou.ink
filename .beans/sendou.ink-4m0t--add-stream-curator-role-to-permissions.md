---
# sendou.ink-4m0t
title: Add STREAM_CURATOR role to permissions
status: todo
type: task
priority: normal
created_at: 2026-01-12T09:20:30Z
updated_at: 2026-01-12T09:21:32Z
parent: sendou.ink-r6ry
blocking:
    - sendou.ink-x535
---

Add new STREAM_CURATOR permission role to allow users to add stream links to calendar events.

## Requirements

- New role in existing permissions system
- Granted by staff (same flow as 'is artist' role)
- Allows adding stream link(s) to calendar events user created
- Scoped to own events only

## Checklist

- [ ] Create migration to add `isStreamCurator` column to User table (Boolean, default 0)
- [ ] Add `"STREAM_CURATOR"` to Role type in `/app/modules/permissions/types.ts`
- [ ] Add mapping in `/app/modules/permissions/mapper.server.ts` userRoles function: `if (user.isStreamCurator) roles.push("STREAM_CURATOR")`
- [ ] Add `makeStreamCuratorByUserId(userId)` function in `/app/features/admin/AdminRepository.server.ts`
- [ ] Add `"STREAM_CURATOR"` action case in `/app/features/admin/actions/admin.server.ts`
- [ ] Add `GiveStreamCurator` component in `/app/features/admin/routes/admin.tsx` (visible to staff)

## Implementation Pattern

Follow existing pattern from `isArtist`:

```typescript
// AdminRepository.server.ts
export function makeStreamCuratorByUserId(userId: number) {
  return db
    .updateTable("User")
    .set({ isStreamCurator: 1 })
    .where("User.id", "=", userId)
    .execute();
}
```

```typescript
// admin.tsx - add to AdminActions, visible to isStaff
{isStaff ? <GiveStreamCurator /> : null}
```