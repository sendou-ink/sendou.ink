---
# sendou.ink-gdrp
title: Update trust-dependent features to use friendship
status: todo
type: task
created_at: 2026-01-13T09:33:32Z
updated_at: 2026-01-13T09:33:32Z
parent: sendou.ink-255r
---

## Overview

Update all code that uses TrustRelationship to use Friendship instead.

## Files to Update

### SendouQ Group Adding
- `app/features/sendouq/actions/q.preparing.server.ts` - ADD_TRUSTED action
- `app/features/sendouq/components/MemberAdder.tsx` - Uses useTrusted hook
- `app/hooks/swr.ts` - useTrusted() hook → useFriends()
- `app/features/sendouq/routes/trusters.ts` - Trusters API → Friends API

### Tournament Join
- `app/features/tournament/actions/to.$id.join.server.ts` - Trust checkbox on join
- `app/features/tournament/loaders/to.$id.register.server.ts` - trusterPlayers query
- Change "trust" checkbox to "add as friend" checkbox

### Scrim Pickups
- `app/features/scrims/actions/scrims.new.server.ts` - Validates trusted for pickup
- Update to check friendship instead

### Settings
- `app/features/sendouq-settings/routes/q.settings.tsx` - Trusted users list
- `app/features/sendouq-settings/QSettingsRepository.server.ts` - Trust queries
- Replace with friends list/management

### Cleanup Routine
- `app/routines/deleteOldTrusts.ts` - Delete after migration complete

## Checklist

- [ ] Update SendouQ ADD_TRUSTED to use friends
- [ ] Update MemberAdder component
- [ ] Replace useTrusted hook with useFriends
- [ ] Update tournament join flow
- [ ] Update scrim pickup validation
- [ ] Update Q settings page
- [ ] Update or remove trust cleanup routine
- [ ] Search codebase for remaining TrustRelationship references
- [ ] E2E tests for updated flows