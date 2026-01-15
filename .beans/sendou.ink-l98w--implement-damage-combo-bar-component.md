---
# sendou.ink-l98w
title: Implement damage combo bar component
status: todo
type: task
created_at: 2026-01-15T19:18:41Z
updated_at: 2026-01-15T19:18:41Z
parent: sendou.ink-knt5
---

## Description
Create the horizontal stacked bar component that visualizes damage combinations.

## Tasks
- [ ] Create `DamageComboBar.tsx` component
- [ ] Implement full-width stacked bar layout
- [ ] Add dotted vertical line at 100 damage threshold
- [ ] Color segments by weapon slot position:
  - Slot 1: yellow
  - Slot 2: pink
  - Slot 3: green
  - Slot 4: blue
- [ ] Display in each segment:
  - Weapon icon (main/sub/special as appropriate)
  - Damage value
  - Damage type name
- [ ] Display on the right side:
  - Total damage
  - Hit count (e.g., "2 hits")
- [ ] For 80-99.9 combos: show ink time with Ink Resistance Up ability icon
- [ ] For combos with sub weapons: show sub defense counter info

## Styling
- Segment width proportional to damage contribution
- Dotted line positioned at (100 / totalDamage * 100)% from left
- Use CSS variables for theming

## Acceptance Criteria
- Bars render correctly with all segments
- 100 damage threshold line is visible
- Colors match slot positions
- Weapon icons display correctly in segments
- Total damage and hit count visible
- Ink time shows for 80-99.9 combos
- Sub defense counter shows for sub weapon combos