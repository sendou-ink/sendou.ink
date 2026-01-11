---
# sendou.ink-2-cz08
title: Rename customJsonField to customField
status: todo
type: task
created_at: 2026-01-11T08:31:34Z
updated_at: 2026-01-11T08:31:34Z
---

Rename the function customJsonField to customField as it's not really about JSON.

## Context
Located at app/form/fields.ts:67

## Checklist
- [ ] Rename customJsonField to customField in fields.ts
- [ ] Update all usages across the codebase
- [ ] Run typecheck to ensure no breakage