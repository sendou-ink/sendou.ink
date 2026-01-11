---
# sendou.ink-2-i2so
title: Improve CustomFieldRenderProps typing for type safety
status: todo
type: task
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

Investigate why we need to explicitly type props as CustomFieldRenderProps and find a more typesafe way for custom form fields.

## Context
Located at app/features/scrims/components/ScrimRequestModal.tsx:74

Current code requires:
```tsx
{(props: CustomFieldRenderProps) => (
    <WithFormField usersTeams={data.teams} {...props} />
)}
```

Related to the FormField props bean - this is about improving type inference for custom render functions.

## Checklist
- [ ] Investigate why explicit typing is needed
- [ ] Design better type inference for children render functions
- [ ] Fix typing across places using CustomFieldRenderProps or ArrayItemRenderContext
- [ ] Update affected components