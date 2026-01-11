---
# sendou.ink-2-44gq
title: Use playwright form helpers in org.spec.ts
status: todo
type: task
created_at: 2026-01-11T08:47:57Z
updated_at: 2026-01-11T08:47:57Z
---

Replace hacky manual locators with proper playwright form helpers from playwright-form.ts.

## Context
Located at e2e/org.spec.ts:60

Current hacky code:
```typescript
const nzapFieldset = page.locator(
    'fieldset.w-min:has(button:has-text("N-ZAP"))',
);
await nzapFieldset.getByLabel("Role", { exact: true }).selectOption("ADMIN");
```

Should use helpers from playwright-form.ts instead.

## Checklist
- [ ] Review available helpers in playwright-form.ts
- [ ] Replace manual fieldset locator with proper helper
- [ ] Update the role selection to use form helpers
- [ ] Verify test still passes