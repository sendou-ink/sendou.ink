---
# sendou.ink-2-1jku
title: Consider array of UserFormField for multi-user selection in scrims
status: todo
type: task
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

Evaluate using array + UserFormField for selecting multiple users in scrims rather than a custom solution.

## Context
Located at app/features/scrims/scrims-schemas.ts:34

## Checklist
- [ ] Review current fromUsers implementation
- [ ] Implement using array field with UserFormField
- [ ] Ensure validation (min 3 users, no duplicates) works
- [ ] Test the multi-user selection UI