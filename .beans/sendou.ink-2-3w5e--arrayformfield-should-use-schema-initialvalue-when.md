---
# sendou.ink-2-3w5e
title: ArrayFormField should use schema initialValue when adding items
status: completed
type: bug
priority: normal
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-11T12:25:07Z
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
- [x] Access initialValue from schema/formField definition
- [x] Use initialValue when adding new array items
- [x] Test with various field types (text, select, etc.)

## Solution
1. Added `itemInitialValue` prop to `ArrayFormField` component
2. In `FormField.tsx`, passed `innerFieldMeta?.initialValue` to `ArrayFormField`
3. Updated `handleAdd` to use `itemInitialValue` when adding new items:
   - If `itemInitialValue !== undefined`, use it
   - Otherwise fall back to previous behavior (`{}` for objects, `undefined` for others)
4. Fixed nested path detection to include array index syntax (`[`) in addition to dot notation (`.`)
5. Added `computeFieldsetInitialValue` helper to compute full initial values for fieldset arrays by iterating through nested fields and collecting their individual initialValues

Tested via Chrome on /vods/new page - adding new games correctly initializes with schema's initial values (mode: TW, stage: Eeltail Alley).
Also tested social links on /org/sendouink/edit - inputs properly accept text input after the nested path fix.