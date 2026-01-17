---
# sendou.ink-nvmn
title: Recalculate combos when filtering damage types
status: completed
type: bug
priority: normal
created_at: 2026-01-17T12:41:53Z
updated_at: 2026-01-17T12:44:14Z
---

The current filtering just hides segments instead of recalculating combos. Need to:
1. Pass excluded damage type keys to calculateDamageCombos
2. Lift filter state to parent component
3. Recalculate combos when filters change

## Checklist
- [x] Add excludedKeys parameter to calculateDamageCombos
- [x] Filter out excluded options in flattenToOptions
- [x] Export FilterKey type and helpers from DamageComboBar
- [x] Change DamageComboList to receive weaponIds and calculate combos internally
- [x] Combos are now recalculated when filters change