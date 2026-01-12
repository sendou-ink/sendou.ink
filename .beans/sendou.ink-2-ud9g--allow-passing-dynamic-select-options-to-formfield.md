---
# sendou.ink-2-ud9g
title: Allow passing dynamic select options to FormField
status: todo
type: feature
priority: normal
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-12T15:00:59Z
parent: plyj
---

FormField should accept select options via the `options` prop, using the same pattern introduced for badges in bean 1sjg.

## Context
Located at app/features/scrims/components/ScrimRequestModal.tsx:90

Currently select fields have static items defined in the schema. For dynamic values (like time options), we need to use custom form fields.

## New Pattern from 1sjg

Bean 1sjg introduced type-safe `options` prop with branded types. Select fields should follow this pattern:

```tsx
// Schema with static options - options prop FORBIDDEN
const schema = z.object({
  region: select({ items: REGIONS, ... }),
});
<FormField name="region" />  // ✅ works
<FormField name="region" options={...} />  // ❌ type error

// Schema with dynamic options - options prop REQUIRED  
const schema = z.object({
  startTime: selectDynamic({ ... }),  // no items in schema
});
<FormField name="startTime" />  // ❌ type error - missing options
<FormField name="startTime" options={timeOptions} />  // ✅ works
```

## Type Safety Requirements
- **MUST provide** `options` if schema field doesn't define items ahead of time
- **CANNOT provide** `options` if schema field already has static items
- Use `FieldWithOptions<T>` branded type (self-describing approach from 1sjg refinement)

## Implementation Approach
1. Add new `selectDynamic()` field helper (or flag on existing `select()`)
2. Brand the return type with `FieldWithOptions<SelectOption[]>` to require options
3. Update `SelectFormField` to accept runtime options
4. The type system will automatically enforce options requirement via `TypedFormFieldProps`

## Checklist
- [ ] Design API for dynamic vs static select options
- [ ] Brand selectDynamic() with `FieldWithOptions<SelectOption[]>`
- [ ] Update SelectFormField to accept runtime options
- [ ] Update StartTimeFormField in scrims to use standard FormField
- [ ] Add type tests to verify compile-time enforcement
- [ ] Document usage for dynamic select options