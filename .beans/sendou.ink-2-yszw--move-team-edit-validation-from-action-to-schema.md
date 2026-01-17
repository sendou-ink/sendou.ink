---
# sendou.ink-2-yszw
title: Move team edit validation from action to schema
status: scrapped
type: task
priority: normal
created_at: 2026-01-11T08:47:55Z
updated_at: 2026-01-17T06:17:46Z
---

Team edit validation (special characters check, duplicate name check) should be in the schema rather than in the action.

## Context
Located at app/features/team/actions/t.$customUrl.edit.server.ts:51

Current action code:
```typescript
errorToastIfFalsy(
    newCustomUrl.length > 0,
    "Team name can't be only special characters",
);
```

## Checklist
- [ ] Move 'only special characters' validation to schema
- [ ] Move duplicate name validation to schema (may need async validation)
- [ ] Remove validation logic from action
- [ ] Ensure proper error messages are shown