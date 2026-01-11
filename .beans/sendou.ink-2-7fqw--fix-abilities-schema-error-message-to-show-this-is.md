---
# sendou.ink-2-7fqw
title: Fix abilities schema error message to show 'This is required'
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T09:23:40Z
---

The abilities schema shows 'Invalid input' error to users instead of 'This is required'.

## Context
Located at app/features/user-page/user-page-schemas.ts:225

## Checklist
- [x] Add custom error message to abilitiesSchema tuple validation
- [x] Use translated message key
- [x] Verify error displays correctly to user

## Solution
Added `{ message: "forms:errors.required" }` to the ability schema refines in `app/utils/zod.ts`:
- `headMainSlotAbility`
- `clothesMainSlotAbility`
- `shoesMainSlotAbility`
- `stackableAbility`

Also updated the browser test to expect the new message.