---
# sendou.ink-2-1421
title: Add mode select form field helper
status: completed
type: feature
priority: normal
created_at: 2026-01-11T08:47:55Z
updated_at: 2026-01-14T07:25:11Z
---

Create a form field helper for game mode selection similar to other field helpers.

## Context
Located at app/features/vods/vods-schemas.ts:106

Currently modes are manually mapped:
```typescript
const modeItems = modesShort.map((mode) => ({
    label: \`modes.${mode}\` as const,
    value: mode,
}));
```

Should have a helper like `modeSelect()` that provides this automatically.

## Checklist
- [ ] Create modeSelect form field helper in fields.ts
- [ ] Update vods-schemas.ts to use the helper
- [ ] Check for other places that could use this helper