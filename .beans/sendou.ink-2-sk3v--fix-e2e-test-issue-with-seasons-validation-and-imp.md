---
# sendou.ink-2-sk3v
title: Fix e2e test issue with Seasons validation and import.meta.env
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T14:27:57Z
---

E2E tests fail because import.meta.env gets evaluated in e2e test context and doesn't work. Season validation code was temporarily removed to make tests pass.

## Context
Located at app/features/user-page/user-page-schemas.ts:50

The validation was:
```typescript
season: z.coerce.number().optional().refine((nth) => \!nth || Seasons.allStarted(new Date()).includes(nth))
```

## Checklist
- [x] Investigate how import.meta.env is used in Seasons
- [x] Find a way to make Seasons work in e2e test context
- [x] Restore the season validation
- [x] Verify e2e tests pass

## Solution
The issue was that Playwright's bundler doesn't have Vite's `import.meta.env` available when bundling test code. When app code is imported in tests, `import.meta.env` is `undefined`.

Fixed by making `import.meta.env` accesses defensive:
- `app/utils/e2e.ts`: Check `typeof import.meta.env !== "undefined"` before accessing
- `app/features/mmr/core/Seasons.ts`: Same defensive check for `VITE_PROD_MODE`

This allows the code to work both in:
1. The built app (where Vite embeds the env vars)
2. Playwright test context (where `import.meta.env` is undefined)