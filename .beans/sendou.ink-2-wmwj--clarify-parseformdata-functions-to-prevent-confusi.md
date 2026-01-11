---
# sendou.ink-2-wmwj
title: Clarify parseFormData functions to prevent confusion
status: todo
type: task
created_at: 2026-01-11T08:31:34Z
updated_at: 2026-01-11T08:31:34Z
---

There are two parseFormData functions - one in parse.server.ts and one in remix.server.ts. Need to ensure they cannot be mixed up or combine them to prevent mistakes.

## Context
Located at app/form/parse.server.ts:8 and app/utils/remix.server.ts

## Checklist
- [ ] Document the difference between the two functions
- [ ] Consider combining them or making the distinction clear
- [ ] Add notes/comments to prevent mixing them up
- [ ] Consider deprecating one in favor of the other