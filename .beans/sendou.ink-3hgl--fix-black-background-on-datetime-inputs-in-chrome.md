---
# sendou.ink-3hgl
title: Fix black background on date/time inputs in Chrome
status: todo
type: bug
created_at: 2026-01-11T12:36:28Z
updated_at: 2026-01-11T12:36:28Z
parent: sendou.ink-1l22
---

Some native input types (time, datetime-local, week, month) display with black backgrounds or styling issues in Chrome. Need to investigate the root cause and apply a consistent fix across all affected input types.

## Details
- Affected inputs: time, datetime-local, week, month (and possibly others)
- Browser: Chrome
- The icons and placeholder text appear correctly but there seems to be a color scheme conflict

## Checklist
- [ ] Identify which CSS rules cause the black background
- [ ] Check if it's related to color-scheme property or browser defaults
- [ ] Apply a fix that works for all affected input types at once
- [ ] Test in Chrome and other browsers