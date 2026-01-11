---
# sendou.ink-2-wukc
title: Fix authorIdsExcluded filter not excluding selected authors
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T11:58:51Z
---

In calendar filters, selecting an author to exclude does not actually exclude them from results.

## Context
Located at app/features/calendar/calendar-schemas.ts:156

The authorIdsExcluded array field with userSearchOptional is defined but the exclusion is not working.

## Root Cause
The `setValue` function in `SendouForm.tsx` only handled dot notation (`.`) for nested paths, but not bracket notation (`[0]`) for array indices. When a field like `authorIdsExcluded[0]` was updated, it was stored as a flat key instead of updating the array at index 0, resulting in:
- `authorIdsExcluded: [null]` (initial array with undefined)
- `authorIdsExcluded[0]: 274` (the actual value as a separate key)

## Fix
Updated `setValue` in `app/form/SendouForm.tsx` (line 133) to also check for `[` in the path name:
```tsx
if (name.includes(".") || name.includes("[")) {
```

This ensures array paths use `setNestedValue` which correctly handles bracket notation.

## Checklist
- [x] Investigate why author exclusion is not working
- [x] Check if the form value is being passed correctly
- [x] Check if the filter logic handles authorIdsExcluded
- [x] Fix the issue and verify authors are excluded