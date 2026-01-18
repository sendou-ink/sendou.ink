---
# sendou.ink-2-7zxu
title: Make 0 the default for minLength/min in form fields
status: completed
type: task
priority: normal
created_at: 2026-01-18T08:43:24Z
updated_at: 2026-01-18T08:47:35Z
---

## Summary
Remove repetitive minLength: 0 and min: 0 specifications by making 0 the default value.

## Checklist
- [x] Update checkboxGroup in app/form/fields.ts to default minLength to 0
- [x] Update array in app/form/fields.ts to make min optional with default 0
- [x] Update FormFieldArray type in app/form/types.ts to make min optional
- [x] Remove minLength: 0 / min: 0 from calendar-schemas.ts
- [x] Remove minLength: 0 from user-page-schemas.ts
- [x] Remove minLength: 0 from q-settings-schemas.ts
- [x] Remove min: 0 from tournament-organization-schemas.ts
- [x] Run npm run checks to verify all passes