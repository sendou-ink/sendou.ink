---
# sendou.ink-2-e4b6
title: Fix scrim user validation messages not translated at runtime
status: todo
type: bug
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

Translation messages for scrim user validation are not being translated at runtime.

## Context
Located at app/features/scrims/scrims-schemas.ts:40 and :45

Messages affected:
- forms:errors.minUsersExcludingYourself
- forms:errors.usersMustBeUnique

## Checklist
- [ ] Verify translation keys exist in forms.json
- [ ] Investigate why runtime translation is not working
- [ ] Fix the translation mechanism for Zod error messages
- [ ] Verify translated messages display to users