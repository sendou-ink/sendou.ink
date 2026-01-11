---
# sendou.ink-2-p1sp
title: Fix div validation message translation in scrims
status: todo
type: bug
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

The division validation message 'errors.divBothOrNeither' is not being shown translated to users.

## Context
Located at app/features/scrims/scrims-schemas.ts:142

## Checklist
- [ ] Verify/add translation key in appropriate json file
- [ ] Fix the translation mechanism
- [ ] Verify translated message displays correctly