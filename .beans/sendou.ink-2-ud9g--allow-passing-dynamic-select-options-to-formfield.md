---
# sendou.ink-2-ud9g
title: Allow passing dynamic select options to FormField
status: todo
type: feature
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

FormField should be able to accept select options directly as a prop for cases where options are determined at runtime.

## Context
Located at app/features/scrims/components/ScrimRequestModal.tsx:90

Currently select fields have static items defined in the schema. For dynamic values (like time options), we need to use custom form fields.

## Checklist
- [ ] Add selectOptions prop to FormField
- [ ] Update SelectFormField to accept runtime options
- [ ] Update StartTimeFormField in scrims to use standard FormField
- [ ] Document usage for dynamic select options