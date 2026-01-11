---
# sendou.ink-2-1sjg
title: FormField should accept field-specific props instead of children render
status: todo
type: feature
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-11T08:31:33Z
---

FormField component should accept props specific to each field type, eliminating the need for children render functions. For example, badges field should accept badgeOptions as a prop.

## Context
Located at app/form/FormField.tsx:365 and app/features/tournament-organization/routes/org.$slug.edit.tsx:56

Currently badges requires:
```tsx
<FormField name="badges">
  {({ value, onChange }) => (
    <BadgesSelector options={data.badgeOptions} ... />
  )}
</FormField>
```

Should become:
```tsx
<FormField name="badges" badgeOptions={data.badgeOptions} />
```

## Checklist
- [ ] Design prop interface for FormField to accept field-specific props
- [ ] Implement badgeOptions prop for badges field type
- [ ] Update FormField to render BadgesSelector internally when type is badges
- [ ] Update org.$slug.edit.tsx to use the new API
- [ ] Check for other field types that might benefit from this pattern
- [ ] Remove children render requirement for badges