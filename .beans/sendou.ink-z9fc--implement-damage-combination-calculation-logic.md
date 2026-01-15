---
# sendou.ink-z9fc
title: Implement damage combination calculation logic
status: todo
type: task
created_at: 2026-01-15T19:18:15Z
updated_at: 2026-01-15T19:18:15Z
parent: sendou.ink-knt5
---

## Description
Create the core algorithm that calculates all valid damage combinations from selected weapons.

## Tasks
- [ ] Create `core/damage-combinations.ts` with main calculation functions
- [ ] Extract damage values from Build Analyzer's weapon data
- [ ] Generate combinations across main/sub/special weapons
- [ ] Implement combination rules:
  - Up to 3 different damage types per combo
  - Max 2 repeats of same damage type
  - Exclude single-weapon-only combinations
- [ ] Filter to combos that deal 80+ damage
- [ ] Sort by lowest damage first (most efficient)
- [ ] Apply hard cap of 50 results
- [ ] Add TBD placeholder for advanced filtering algorithm

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
- Correctly generates all valid 2-3 hit combinations
- Respects repeat limit (max 2 of same damage type)
- Excludes single-weapon combos
- Results sorted by efficiency (lowest damage first)
- Capped at 50 results