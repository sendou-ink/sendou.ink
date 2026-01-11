---
# sendou.ink-2-sk3v
title: Fix e2e test issue with Seasons validation and import.meta.env
status: todo
type: bug
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T08:47:44Z
---

E2E tests fail because import.meta.env gets evaluated in e2e test context and doesn't work. Season validation code was temporarily removed to make tests pass.

## Context
Located at app/features/user-page/user-page-schemas.ts:50

The validation was:
```typescript
season: z.coerce.number().optional().refine((nth) => \!nth || Seasons.allStarted(new Date()).includes(nth))
```

## Checklist
- [ ] Investigate how import.meta.env is used in Seasons
- [ ] Find a way to make Seasons work in e2e test context
- [ ] Restore the season validation
- [ ] Verify e2e tests pass