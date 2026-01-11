---
# sendou.ink-2-e4b6
title: Fix scrim user validation messages not translated at runtime
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T18:55:42Z
---

Translation messages for scrim user validation are not being translated at runtime.

## Context
Located at app/features/scrims/scrims-schemas.ts:40 and :45

Messages affected:
- forms:errors.minUsersExcludingYourself
- forms:errors.usersMustBeUnique

## Checklist
- [x] Verify translation keys exist in forms.json
- [x] Investigate why runtime translation is not working
- [x] Fix the translation mechanism for Zod error messages
- [x] Verify translated messages display to users

## Solution
The issue was in `WithFormField.tsx` - when in PICKUP mode, the error message was being displayed directly without translation. Added `useTranslatedTexts` hook to translate the error before displaying it.