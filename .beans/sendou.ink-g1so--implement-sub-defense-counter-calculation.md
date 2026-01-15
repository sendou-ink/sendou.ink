---
# sendou.ink-g1so
title: Implement sub defense counter calculation
status: todo
type: task
created_at: 2026-01-15T19:18:32Z
updated_at: 2026-01-15T19:18:32Z
parent: sendou.ink-knt5
---

## Description
Calculate how much Sub Defense Up AP an enemy needs to survive combos involving sub weapons.

## Tasks
- [ ] Create sub defense calculation function
- [ ] Reference Build Analyzer's sub weapon defense calculations
- [ ] For each combo involving sub weapon damage:
  - Calculate minimum Sub Defense AP to reduce damage below 100
  - Handle cases where no amount of Sub Defense can save the target
- [ ] Display AP value in results (left side of the combo bar chart)

## Output
- Add `subDefenseToCounter?: number` to DamageCombo type (AP value)
- Only populated for combos involving sub weapon damage
- Value represents minimum AP needed to drop combo below 100 damage

## Acceptance Criteria
- Correctly calculates Sub Defense AP breakpoints
- Only shows for combos with sub weapon involvement
- Displays raw AP value (not gear slots)
