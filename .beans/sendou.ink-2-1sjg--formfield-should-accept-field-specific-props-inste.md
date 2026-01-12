---
# sendou.ink-2-1sjg
title: FormField should accept field-specific props instead of children render
status: completed
type: feature
priority: normal
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-12T14:54:08Z
---

FormField component now accepts type-safe field-specific props, eliminating the need for children render functions.

## Final Implementation

Uses `FieldWithOptions<T>` branded type for self-describing field options. Each field helper directly encodes its required options type, eliminating the need for a separate mapping:

```tsx
// Works - badges field gets typed options requirement
<FormField name="badges" options={data.badgeOptions} />

// Type error - options required for badges field
<FormField name="badges" />

// Type error - options not allowed on non-badge fields
<FormField name="name" options={data.badgeOptions} />
```

## Usage Pattern

For fields requiring options, use render props to get typed FormField:

```tsx
<SendouForm schema={schema} defaultValues={...}>
  {({ FormField }) => (
    <>
      <FormField name="name" />
      <FormField name="badges" options={data.badgeOptions} />
    </>
  )}
</SendouForm>
```

For simple fields without options, FormField can be imported directly.

## Files Modified
- `app/form/types.ts` - Added `FieldWithOptions<T>` branded type and `TypedFormFieldProps`
- `app/form/fields.ts` - Brand badges() with `FieldWithOptions<BadgeOption[]>`
- `app/form/FormField.tsx` - Added options prop handling for badges
- `app/form/fields/BadgesFormField.tsx` - New component wrapping BadgesSelector
- `app/form/SendouForm.tsx` - Added typed FormField to render props
- `app/features/tournament-organization/routes/org.$slug.edit.tsx` - Updated to use new API

## Type System Design

The `FieldWithOptions<T>` approach is self-describing - each field helper brands its return type with the exact options type it needs:

```typescript
// In fields.ts - the options type is encoded directly
badges(...) as z.ZodArray<...> & FieldWithOptions<BadgeOption[]>

// In types.ts - extract options type directly from schema
type TypedFormFieldProps<TSchema, TName> = {
  name: TName;
} & (TSchema[TName] extends FieldWithOptions<infer TOptions>
  ? { options: TOptions }
  : { options?: never });
```

Benefits:
- No separate `FieldOptionsMap` to maintain
- Adding new field types requiring options only needs branding in the field helper
- Options type is inferred from the schema itself

## Checklist
- [x] Design prop interface for FormField to accept field-specific props
- [x] Implement options prop for badges field type
- [x] Update FormField to render BadgesSelector internally when type is badges
- [x] Update org.$slug.edit.tsx to use the new API
- [x] Implement full type safety via branded types
- [x] Remove children render requirement for badges