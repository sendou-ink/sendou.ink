---
# sendou.ink-2-0th1
title: Badges selector shows validation error on blur
status: completed
type: bug
priority: normal
created_at: 2026-01-12T16:30:20Z
updated_at: 2026-01-13T06:03:50Z
---

## Description

When the badges selector field loses focus (blur event), it displays an incorrect validation error message:

```
Invalid input: expected array, received SyntheticBaseEvent
```

## Root Cause (suspected)

The onBlur handler is likely being passed directly to a Zod validation function that expects an array value, but instead receives the React SyntheticBaseEvent object. The blur handler should either:
1. Not trigger validation at all
2. Extract the current field value before passing to validation

## Steps to Reproduce

1. Go to user profile edit page (or wherever badges can be selected)
2. Click on the 'Select badge to add' dropdown
3. Click away from the dropdown (blur)
4. Error message appears below the field

## Expected Behavior

No validation error should appear on blur, or if validation is needed, it should validate the actual array of selected badges, not the blur event object.