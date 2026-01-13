---
# sendou.ink-0sk2
title: Remove trusted users management UI from settings
status: todo
type: task
priority: normal
created_at: 2026-01-13T11:25:10Z
updated_at: 2026-01-13T11:25:15Z
parent: sendou.ink-255r
blocking:
    - sendou.ink-kluy
---

## Overview

Delete the "Trusted Users" section from SendouQ settings page. This UI is replaced by the /friends page.

## Files to Modify

### app/features/sendouq-settings/routes/q.settings.tsx
- Remove `<TrustedUsers />` component usage (line ~86)
- Delete `TrustedUsers` function component (lines ~611-680)

### app/features/sendouq-settings/actions/q.settings.server.ts
- Remove `REMOVE_TRUST` case from switch (lines ~44-49)

### app/features/sendouq-settings/q-settings-schemas.server.ts
- Remove `REMOVE_TRUST` schema from union (lines ~68-71)

### app/features/sendouq-settings/loaders/q.settings.server.ts
- Remove `trusted` from loader data

### app/features/sendouq-settings/QSettingsRepository.server.ts
- Remove `findTrustedUsersByGiverId` function
- Remove `deleteTrustedUser` function
- (Keep other functions until full trust deprecation)

## i18n Keys to Remove

From `q` namespace:
- `q:settings.trusted.header`
- `q:settings.trusted.confirm`
- `q:settings.trusted.trustedExplanation`
- `q:settings.trusted.noTrustedExplanation`
- `q:settings.trusted.teamExplanation`

## Checklist

- [ ] Remove TrustedUsers component from q.settings.tsx
- [ ] Remove REMOVE_TRUST action handler
- [ ] Remove REMOVE_TRUST schema
- [ ] Remove trusted from loader
- [ ] Remove repository functions (findTrustedUsersByGiverId, deleteTrustedUser)
- [ ] Remove i18n keys
- [ ] Run `npm run i18n:sync`
- [ ] Verify settings page still works