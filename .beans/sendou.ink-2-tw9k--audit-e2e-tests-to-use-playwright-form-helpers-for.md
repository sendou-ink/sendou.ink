---
# sendou.ink-2-tw9k
title: Audit e2e tests to use playwright form helpers for all touched forms
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:52:53Z
updated_at: 2026-01-13T12:04:22Z
---

Review all e2e tests for forms that were modified during the form overhaul and ensure they use the playwright form helpers from playwright-form.ts as much as possible.

## Context
During the form overhaul from React Hook Form to the new declarative model, many forms were touched. The e2e tests for these forms should be updated to use the standard form helpers instead of manual locators.

## Checklist
- [x] Identify all forms that were modified in the new-forms branch
- [x] Find corresponding e2e tests for these forms
- [x] Review each test for manual form interactions (locators, clicks, inputs)

### Tests to update:

**vods.spec.ts** - Uses vod form but doesn't use form helpers at all
- [x] Update "adds video (pov)" test to use `vodFormBaseSchema` helpers
- [x] Update "adds video (cast)" test to use `vodFormBaseSchema` helpers

**org.spec.ts** - Partially uses form helpers
- [x] Update "can create a new organization" to use `newOrganizationSchema` helpers
- [x] Update ban user form to use `banUserActionSchema` helpers
- **Note:** Tests have PRE-EXISTING failures (server errors on /org/new) unrelated to form helpers

**scrims.spec.ts** - First test uses manual locators for `postText` field
- [x] Update "creates a new scrim & deletes it" to use form.fill for `postText`
- **Note:** Tests have PRE-EXISTING failures (server errors) unrelated to form helpers

### Verification
- [x] Run e2e tests - vods tests pass, org/scrims have pre-existing failures