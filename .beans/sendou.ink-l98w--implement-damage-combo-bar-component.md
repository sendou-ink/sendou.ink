---
# sendou.ink-l98w
title: Implement damage combo bar component
status: in-progress
type: task
priority: normal
created_at: 2026-01-15T19:18:41Z
updated_at: 2026-01-17T09:26:28Z
parent: sendou.ink-knt5
---

## Description
Create the horizontal stacked bar component that visualizes damage combinations.

## Tasks
- [x] Create `DamageComboBar.tsx` component
- [x] Implement full-width stacked bar layout
- [x] Add dotted vertical line at 100 damage threshold
- [x] Color segments by weapon slot position:
  - Slot 1: yellow
  - Slot 2: pink
  - Slot 3: green
  - Slot 4: blue
- [x] Display in each segment:
  - Weapon icon (main/sub/special as appropriate)
  - Damage value
  - Damage type name
- [x] Display on the right side:
  - Total damage
  - Hit count (e.g., "2 hits")
- [ ] For 80-99.9 combos: show ink time with Ink Resistance Up ability icon
- [ ] For combos with sub weapons: show sub defense counter info

## Styling
- Segment width proportional to damage contribution
- Dotted line positioned at (100 / totalDamage * 100)% from left
- Use CSS variables for theming

## Acceptance Criteria
- [x] Bars render correctly with all segments
- [x] 100 damage threshold line is visible
- [x] Colors match slot positions
- [x] Weapon icons display correctly in segments
- [x] Total damage and hit count visible
- [ ] Ink time shows for 80-99.9 combos
- [ ] Sub defense counter shows for sub weapon combos
