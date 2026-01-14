---
# sendou.ink-2-r8gb
title: Require explicit maxLength for number fields
status: scrapped
type: task
created_at: 2026-01-11T08:31:34Z
updated_at: 2026-01-11T08:31:34Z
---

Remove the arbitrary default maxLength of 10 for number fields and require explicit specification.

## Context
Located at app/form/fields.ts:191

Current code has `maxLength: args.maxLength ?? 10` which is an arbitrary default.

## Checklist
- [ ] Make maxLength required for numberFieldOptional
- [ ] Update all usages to specify explicit maxLength
- [ ] Consider if there's a sensible default or if explicit is always better
