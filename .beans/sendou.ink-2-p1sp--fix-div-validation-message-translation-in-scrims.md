---
# sendou.ink-2-p1sp
title: Fix div validation message translation in scrims
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T13:45:25Z
---

The division validation message 'errors.divBothOrNeither' is not being shown translated to users.

## Context
Located at app/features/scrims/scrims-schemas.ts:142

## Checklist
- [x] Verify/add translation key in appropriate json file
- [x] Fix the translation mechanism
- [x] Verify translated message displays correctly

## Solution
The issue was in `app/form/fields.ts` in the `dualSelectOptional` function. The validation message was being passed directly without the `forms:` namespace prefix.

Fixed by:
1. Adding `forms:` prefix to the validation message at line 344
2. Updated the `WithTypedDualSelectFields` type to enforce `FormsTranslationKey` for the validate.message property