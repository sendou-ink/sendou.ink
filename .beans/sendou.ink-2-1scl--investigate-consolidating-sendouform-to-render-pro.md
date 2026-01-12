---
# sendou.ink-2-1scl
title: Investigate consolidating SendouForm to render props API
status: todo
type: task
created_at: 2026-01-12T14:57:00Z
updated_at: 2026-01-12T14:57:00Z
---

Investigate whether all SendouForm usages should be migrated to the new render props API pattern.

## Context
Bean 1sjg introduced a render props pattern for type-safe field options:

```tsx
<SendouForm schema={schema} defaultValues={...}>
  {({ FormField }) => (
    <>
      <FormField name="name" />
      <FormField name="badges" options={badgeOptions} />
    </>
  )}
</SendouForm>
```

Currently both patterns work:
1. **Render props**: `{({ FormField }) => ...}` - provides type-safe FormField
2. **Direct children**: `<FormField name="..." />` - imports FormField directly

## Questions to Answer
- [ ] How many SendouForm usages exist in the codebase?
- [ ] How many use render props vs direct children?
- [ ] What's the migration effort to consolidate to render props?
- [ ] Are there benefits to having a single consistent pattern?
- [ ] Should we deprecate/remove the direct children pattern?

## Checklist
- [ ] Audit all SendouForm usages in the codebase
- [ ] Categorize by current pattern used
- [ ] Assess migration complexity for each
- [ ] Document recommendation with rationale
