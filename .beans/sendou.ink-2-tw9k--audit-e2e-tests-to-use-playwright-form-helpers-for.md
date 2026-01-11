---
# sendou.ink-2-tw9k
title: Audit e2e tests to use playwright form helpers for all touched forms
status: todo
type: task
created_at: 2026-01-11T08:52:53Z
updated_at: 2026-01-11T08:52:53Z
---

Review all e2e tests for forms that were modified during the form overhaul and ensure they use the playwright form helpers from playwright-form.ts as much as possible.

## Context
During the form overhaul from React Hook Form to the new declarative model, many forms were touched. The e2e tests for these forms should be updated to use the standard form helpers instead of manual locators.

## Checklist
- [ ] Identify all forms that were modified in the new-forms branch
- [ ] Find corresponding e2e tests for these forms
- [ ] Review each test for manual form interactions (locators, clicks, inputs)
- [ ] Replace manual interactions with playwright-form.ts helpers where possible
- [ ] Verify tests still pass after updates