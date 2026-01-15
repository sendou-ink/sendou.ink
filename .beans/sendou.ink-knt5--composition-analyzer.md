---
# sendou.ink-knt5
title: Composition Analyzer
status: todo
type: epic
created_at: 2026-01-15T19:17:46Z
updated_at: 2026-01-15T19:17:46Z
---

## Motivation

Users want to conveniently see how different compositions of weapons work together, especially how different damage values synergize. Currently users have to memorize damage values or manually calculate combinations.

### User Story

> I'd like a "composition analyzer" where we can toggle certain weapons to explore chip damage combos. Something that takes the 4 weps you give it and provides a few different baseline damage combos to get you to over 100 with some estimations on time to splat.
>
> Example: The reason S-Blast + Slosher is strong is because you have 50+50 from both main weps or pencil shot + burst bomb indirect + anything. Having a tool that a user could play around with what team comps have synergies could lead to interesting discoveries and better comp build focus.

## Feature Overview

New route: `/comp-analyzer` (client-side only, no loader/action)

### Weapon Selection
- Display all weapons in a categorized grid
- Categorization options: by weapon category, by sub weapon, or by special weapon
- Select up to 4 weapons
- Show main/sub/special icons for each selected weapon
- X button to remove weapons

### Damage Combo Display
- Full-width horizontal stacked bars
- Dotted line marking the 100 damage threshold
- Colors fixed by slot position: 1st=yellow, 2nd=pink, 3rd=green, 4th=blue
- Each segment shows: weapon icon + damage value + damage type name
- Total damage and hit count displayed on the right
- Sorted by lowest damage first (most efficient combos)
- Hard cap at 50 combos (algorithm filtering TBD)

### Combo Calculation Rules
- Combinations across main, sub & special weapons
- Up to 3 different damage types per combo
- Max 2 repeats of same damage type
- Does NOT show combinations involving only one weapon
- For 80-99.9 damage: show seconds in enemy ink needed to splat (considering Ink Resistance Up = RES)
- For combos involving sub weapons: show Sub Defense AP needed to counter

### Filtering Controls
- Radio buttons: "All" + each individual weapon (shown when 3+ weapons selected)
- Selecting a weapon shows only combos involving that weapon or its sub/special
- Ink Resistance slider: 0-57 AP (affects 80-99.9 damage time calculations)

### Screenshot Feature
- Captures: title + author (if logged in) + weapons with their sub/special
- Does NOT include damage combo results
- Pattern similar to tier-list-maker

## Technical Notes
- Reference Build Analyzer's damage calculation system (`buildStats`, `DAMAGE_TYPE`, etc.)
- Reference ink damage functions: `damageTakenInEnemyInkPerSecond`, `enemyInkDamageLimit`, `framesBeforeTakingDamageInEnemyInk`
- Use URL search params for state management (shareable URLs)
- Use snapdom for screenshot functionality

## Testing Strategy
- Unit tests for damage combination calculations
- Browser tests for damage combo chart rendering
- E2E tests for page interactions (minimal)
- Manual Chrome integration testing
