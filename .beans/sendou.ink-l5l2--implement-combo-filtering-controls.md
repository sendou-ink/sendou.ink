---
# sendou.ink-l5l2
title: Implement combo filtering controls
status: todo
type: task
created_at: 2026-01-15T19:18:49Z
updated_at: 2026-01-15T19:18:49Z
parent: sendou.ink-knt5
---

## Description
Create the filtering UI that allows users to filter combos by weapon and adjust Ink Resistance.

## Tasks
- [ ] Create filtering controls section above damage combo list
- [ ] Implement radio button group:
  - "All" option (shows all combos)
  - One option per selected weapon (shown only when 3+ weapons selected)
  - Selecting a weapon filters to combos involving that weapon or its sub/special
- [ ] Implement Ink Resistance slider:
  - Range: 0-57 AP
  - Increment: 1 AP
  - Affects time calculation for 80-99.9 damage combos
  - Show Ink Resistance Up ability icon
- [ ] Store filter state in URL search params

## UI Details
- Radio buttons in a horizontal row
- Slider with numeric input for precise values
- Label showing current AP value

## Acceptance Criteria
- Radio buttons filter combo results correctly
- Radio buttons only visible with 3+ weapons selected
- Slider adjusts ink time calculations in real-time
- Filter state persists in URL