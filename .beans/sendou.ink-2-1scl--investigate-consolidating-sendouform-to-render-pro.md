---
# sendou.ink-2-1scl
title: Investigate consolidating SendouForm to render props API
status: completed
type: task
priority: normal
created_at: 2026-01-12T14:57:00Z
updated_at: 2026-01-17T09:09:32Z
---

Migrate all SendouForm usages to consistently use the render props API pattern and deprecate direct FormField imports.

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

The render props pattern provides better type safety for fields that require `options` prop (like `selectDynamicOptional`).

## Changes Made

### Type System Updates
- Updated `TypedFormFieldComponent` to support `children` prop for custom rendering
- Added `FlexibleFormFieldProps` type to allow string names for nested field paths
- Added `FormFieldChildrenProps` type for children render function props

### Migration Status

**Fully migrated (using `{({ FormField }) => ...}`):**
- [x] `org.$slug.edit.tsx`
- [x] `scrims.new.tsx`
- [x] `FiltersDialog.tsx`
- [x] `ScrimFiltersDialog.tsx`
- [x] `NewBuildForm.tsx`
- [x] `ScrimRequestModal.tsx`
- [x] `org.$slug.tsx` (AdminControls)
- [x] `org.new.tsx`
- [x] `t.tsx` (NewTeamDialog)
- [x] `q.settings.tsx` (VoiceChat, WeaponPool, Misc)
- [x] `settings.tsx`
- [x] `associations.new.tsx`
- [x] `vods.new.tsx`
- [x] `scrims.$id.tsx` (CancelScrimForm)
- [x] `BanUserModal.tsx`
- [x] `u.$identifier.admin.tsx`

### Deprecation Notices
- [x] Added deprecation JSDoc to `FormField` export in `~/form/FormField.tsx`
- [x] Added deprecation JSDoc to `FormField` export in `~/form/index.ts`

### Verification
- [x] TypeScript typecheck passes
- [x] Biome check passes
- [x] All 1101 unit and browser tests pass
