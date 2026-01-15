---
# sendou.ink-tasm
title: Implement ink damage time calculation
status: todo
type: task
created_at: 2026-01-15T19:18:24Z
updated_at: 2026-01-15T19:18:24Z
parent: sendou.ink-knt5
---

## Description
Calculate how long an enemy must stand in ink for 80-99.9 damage combos to become lethal.

## Tasks
- [ ] Create ink damage calculation function in `core/damage-combinations.ts`
- [ ] Reference existing functions from Build Analyzer:
  - `damageTakenInEnemyInkPerSecond`
  - `enemyInkDamageLimit`
  - `framesBeforeTakingDamageInEnemyInk`
- [ ] Calculate seconds needed based on:
  - Remaining damage needed (100 - combo damage)
  - Enemy's Ink Resistance Up AP (0-57)
- [ ] Handle edge cases:
  - Ink damage cap (enemyInkDamageLimit)
  - Grace period before taking damage
  - Cases where ink damage alone cannot finish the kill

## Output
- Add `inkTimeSeconds?: number` to DamageCombo type
- Add `inkTimeFrames?: number` for precision
- Add `inkTimeImpossible?: boolean` when ink cap prevents kill

## Acceptance Criteria
- Correctly calculates time for 80-99.9 damage combos
- Accounts for enemy Ink Resistance Up
- Handles ink damage cap correctly
- Returns undefined for 100+ combos (no ink time needed)