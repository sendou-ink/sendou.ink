---
# sendou.ink-2-0ghq
title: Add browser test for value counter display
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-14T07:56:29Z
---

Add a test in SendouForm.browser.test.tsx to verify the value counter (like '3/10 characters') works correctly for form fields that have character limits.

## Context
Located at app/form/SendouForm.browser.test.tsx:273

## Checklist
- [x] Add test case for value counter display
- [x] Verify counter updates as user types
- [x] Verify counter shows correct format (current/max)