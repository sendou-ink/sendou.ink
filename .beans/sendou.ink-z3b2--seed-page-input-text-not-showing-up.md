---
# sendou.ink-z3b2
title: Seed page input text not showing up
status: todo
type: bug
created_at: 2026-01-18T20:04:43Z
updated_at: 2026-01-18T20:04:43Z
parent: sendou.ink-1l22
---

On the tournament seed page, the seed number input fields appear empty even when they should contain values. The input boxes are visible but the text inside them is not rendering (likely a color/contrast issue with the CSS rework).

## Screenshot
The seed column shows empty input boxes where numbers should be visible.

## Expected Behavior
Seed numbers (1, 2, 3, etc.) should be visible inside the input fields.

## Likely Cause
Text color in the input field may be the same as or too close to the background color after the CSS variable changes.