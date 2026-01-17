---
# sendou.ink-z9fc
title: Implement damage combination calculation logic
status: completed
type: task
priority: normal
created_at: 2026-01-15T19:18:15Z
updated_at: 2026-01-17T06:05:03Z
parent: sendou.ink-knt5
---

## Description
Create the core algorithm that calculates all valid damage combinations from selected weapons.

## Tasks
- [x] Create `core/damage-combinations.ts` with main calculation functions
- [x] Extract damage values from Build Analyzer's weapon data
- [x] Generate combinations across main/sub/special weapons
- [x] Implement combination rules:
  - Up to 3 different damage types per combo
  - Max 2 repeats of same damage type
  - Exclude single-weapon-only combinations
- [x] Filter to combos that deal 80+ damage
- [x] Sort by closest to 100 (lethal threshold, most efficient kills)
- [x] Apply hard cap of 50 results
- [x] Add TBD placeholder for advanced filtering algorithm

## Data Sources
- Use Build Analyzer's `buildStats` function for weapon damage data
- Reference `DAMAGE_TYPE` constants for damage type names
- Reference `damageTypeToWeaponType` for main/sub/special classification

## Output Structure
```typescript
interface DamageCombo {
  segments: Array<{
    weaponSlot: number; // 0-3
    weaponId: MainWeaponId;
    damageType: DamageType;
    damageValue: number;
    isSubWeapon: boolean;
    isSpecialWeapon: boolean;
    count: number; // 1 or 2 for repeats
  }>;
  totalDamage: number;
  hitCount: number;
}
```

## Acceptance Criteria
- [x] Correctly generates all valid 2-3 hit combinations
- [x] Respects repeat limit (max 2 of same damage type)
- [x] Excludes single-weapon combos
- [x] Results sorted by efficiency (closest to 100 damage first)
- [x] Capped at 50 results