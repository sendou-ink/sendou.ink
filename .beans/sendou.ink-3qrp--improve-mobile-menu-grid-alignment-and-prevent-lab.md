---
# sendou.ink-3qrp
title: Improve mobile menu grid alignment and prevent label wrapping
status: todo
type: bug
created_at: 2026-01-11T09:42:29Z
updated_at: 2026-01-11T09:42:29Z
parent: sendou.ink-6eko
---

## Problem

On mobile, the menu grid has alignment issues and some page labels are breaking into two or three lines, creating an inconsistent and cluttered appearance.

## Screenshot

Labels breaking to multiple lines:
- "Build Analyzer" (2 lines)
- "User Search" (2 lines)  
- "Top Search" (2 lines)
- "Tier List Maker" (3 lines)
- "Plus Server" (2 lines)
- "Leaderboards" wrapping

Meanwhile other labels like "Settings", "SendouQ", "Builds", "Scrims", "LFG" etc. fit on one line.

## Expected behavior

- Menu items should be consistently aligned
- Labels should ideally fit on a single line
- If wrapping is unavoidable, it should be limited to two lines maximum

## Possible solutions

- Reduce number of columns to give more horizontal space per item
- Use shorter label names where possible
- Adjust font size for labels
- Use text truncation with ellipsis for long labels

## Acceptance criteria

- Menu grid is visually balanced and aligned
- No labels break to three lines
- Minimize two-line labels where possible
- Consistent spacing between menu items