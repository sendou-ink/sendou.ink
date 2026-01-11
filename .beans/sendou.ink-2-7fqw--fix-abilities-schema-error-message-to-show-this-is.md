---
# sendou.ink-2-7fqw
title: Fix abilities schema error message to show 'This is required'
status: todo
type: bug
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T08:47:44Z
---

The abilities schema shows 'Invalid input' error to users instead of 'This is required'.

## Context
Located at app/features/user-page/user-page-schemas.ts:225

## Checklist
- [ ] Add custom error message to abilitiesSchema tuple validation
- [ ] Use translated message key
- [ ] Verify error displays correctly to user