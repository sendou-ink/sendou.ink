---
# sendou.ink-2-0ih0
title: Always use parseAsync and remove the flag
status: todo
type: task
created_at: 2026-01-11T08:47:57Z
updated_at: 2026-01-11T08:47:57Z
---

Remove the parseAsync flag and always use schema.parseAsync() instead of conditionally choosing between parse and parseAsync.

## Context
Located at app/utils/remix.server.ts:86

## Checklist
- [ ] Update parseRequestPayload to always use parseAsync
- [ ] Update parseFormData to always use parseAsync
- [ ] Remove parseAsync parameter from function signatures
- [ ] Update all call sites that pass parseAsync: true
- [ ] Verify no regressions