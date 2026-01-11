---
# sendou.ink-2-3w5e
title: ArrayFormField should use schema initialValue when adding items
status: todo
type: bug
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-11T08:31:33Z
---

When adding a new item to an array field, it should use the initialValue from the schema definition instead of empty object or undefined.

## Context
Located at app/form/fields/ArrayFormField.tsx:39

Current code:
```typescript
const handleAdd = () => {
  onChange([...value, isObjectArray ? {} : undefined]);
};
```

Should use the initialValue from the schema for new items.

## Checklist
- [ ] Access initialValue from schema/formField definition
- [ ] Use initialValue when adding new array items
- [ ] Test with various field types (text, select, etc.)