---
# sendou.ink-2-wukc
title: Fix authorIdsExcluded filter not excluding selected authors
status: todo
type: bug
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T08:47:44Z
---

In calendar filters, selecting an author to exclude does not actually exclude them from results.

## Context
Located at app/features/calendar/calendar-schemas.ts:156

The authorIdsExcluded array field with userSearchOptional is defined but the exclusion is not working.

## Checklist
- [ ] Investigate why author exclusion is not working
- [ ] Check if the form value is being passed correctly
- [ ] Check if the filter logic handles authorIdsExcluded
- [ ] Fix the issue and verify authors are excluded