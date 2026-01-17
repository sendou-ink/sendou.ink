---
# sendou.ink-bu8m
title: Improve UI alignment when ink frames are shown
status: todo
type: bug
created_at: 2026-01-17T13:40:20Z
updated_at: 2026-01-17T13:40:20Z
---

When ink frames are displayed for sub-100 damage combos, the alignment of the total section is inconsistent between rows that show frames (e.g. '4f + 4 hits') and rows that don't (e.g. '3 hits').

## Problem
- Rows with frames shown have longer hit count text
- This causes visual misalignment in the damage combo list
- The total damage numbers don't line up vertically

## Suggested fixes
- Consider using a fixed-width layout for the total section
- Or display frames on a separate line below the hit count
- Or use tabular/monospace numbers for consistent width

## Screenshot reference
See the difference between '100.5 / 3 hits' and '99.0 / 4f + 4 hits' rows