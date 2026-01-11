---
# sendou.ink-2-0ih0
title: Always use parseAsync and remove the flag
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:47:57Z
updated_at: 2026-01-11T19:04:35Z
---

Remove the parseAsync flag and always use schema.parseAsync() instead of conditionally choosing between parse and parseAsync.

## Context
Located at app/utils/remix.server.ts:86

## Checklist
- [x] Update parseRequestPayload to always use parseAsync
- [x] Update parseFormData to always use parseAsync
- [x] Remove parseAsync parameter from function signatures
- [x] Update all call sites that pass parseAsync: true
- [x] Verify no regressions