---
# sendou.ink-2-ylyf
title: Fix 4 failing e2e tests
status: completed
type: bug
created_at: 2026-01-13T18:08:20Z
updated_at: 2026-01-13T18:08:20Z
---

Four e2e tests are failing:

## Issues

1. **analyzer.spec.ts:13** - Test looks for `weapon-0` testId but WeaponPoolFormField doesn't have such test IDs
2. **org.spec.ts:45** - Uses `fieldset.w-min` CSS selector that doesn't exist (ArrayFormField uses `styles.card`)
3. **org.spec.ts:100** - `selectUser` helper can't find the 'Player' label element
4. **settings.spec.ts:53** - Expects 'Settings updated' toast that's been commented out in settings.server.ts

## Checklist

- [x] Fix analyzer.spec.ts - update weapon assertion to not rely on missing testId
- [x] Fix org.spec.ts admin promotion test - use playwright-form helpers instead of raw CSS selectors
- [x] Fix org.spec.ts banned player test - investigate why selectUser can't find the field
- [x] Fix settings.spec.ts - update test to not expect the removed toast message

## Changes Made

1. **analyzer.spec.ts** - Changed `page.getByTestId("weapon-0")` to `page.getByRole("listitem").getByText("Luna Blaster")` since WeaponPoolFormField doesn't have weapon test IDs

2. **org.spec.ts (admin promotion)** - Replaced `fieldset.w-min:has(button:has-text("N-ZAP"))` with `fieldset:has(button:has-text("N-ZAP"))` since the CSS module class name isn't `w-min`

3. **org.spec.ts (banned player)** -
   - UserSearch component had hardcoded `aria-label="User search"` which overrode the Label component's labeling
   - Fixed UserSearch to only use aria-label when no label prop is provided
   - Updated test to directly interact with UserSearch button instead of using form helper
   - Added datetime field filling to avoid validation issues

4. **settings.spec.ts** - Changed from expecting "Settings updated" toast to using `waitForPOSTResponse` since the toast was removed

5. **u.$identifier.builds.new.server.ts** - Fixed loader to return defaultValues even when not editing an existing build (was only returning null when no buildToEdit)
