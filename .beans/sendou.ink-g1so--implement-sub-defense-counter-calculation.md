---
# sendou.ink-g1so
title: Implement sub defense counter calculation
status: completed
type: task
priority: normal
created_at: 2026-01-15T19:18:32Z
updated_at: 2026-01-17T15:21:29Z
parent: sendou.ink-knt5
---

## Description
Allow setting enemy Sub Defense Up AP via slider to show how combos are affected.

## Tasks
- [x] Create sub defense calculation function in damage-combinations.ts
- [x] Reference Build Analyzer's sub weapon defense calculations
- [x] Apply sub defense reduction to sub weapon damage during combo calculation
- [x] Add slider UI for enemy Sub Defense Up AP (similar to Ink Resistance slider)
- [x] Show slider only when combos include sub weapon damage

## Implementation
- Added `calculateSubDamageWithDefense` function using `abilityPointsToEffects`
- Modified `extractDamageSources` to accept `targetSubDefenseAp` parameter
- Modified `calculateDamageCombos` to accept `targetSubDefenseAp` parameter
- Added slider in `DamageComboList` component
- Added translation key `comp.enemySubDef`

## Acceptance Criteria
- [x] Slider appears when combos have sub weapon involvement
- [x] Adjusting slider recalculates combo damages with sub defense applied
- [x] Combo totals reflect reduced sub weapon damage
