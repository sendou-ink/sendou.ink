---
# sendou.ink-2-cz08
title: Rename customJsonField to customField
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:31:34Z
updated_at: 2026-01-11T11:47:18Z
---

Rename the function customJsonField to customField as it's not really about JSON.

## Context
Located at app/form/fields.ts:67

## Checklist
- [x] Rename customJsonField to customField in fields.ts
- [x] Update all usages across the codebase
- [x] Run typecheck to ensure no breakage