---
# sendou.ink-t5nv
title: Implement weapon selector component
status: todo
type: task
created_at: 2026-01-15T19:18:04Z
updated_at: 2026-01-15T19:18:04Z
parent: sendou.ink-knt5
---

## Description
Create the weapon selection UI that allows users to pick up to 4 weapons with categorization options.

## Tasks
- [ ] Create `WeaponSelector.tsx` component
- [ ] Implement categorized weapon grid display
- [ ] Add categorization toggle: by weapon category / by sub weapon / by special weapon
- [ ] Show selected weapons with main/sub/special icons
- [ ] Add X button to remove selected weapons
- [ ] Limit selection to 4 weapons maximum
- [ ] Store selection in URL search params for shareability

## UI Details
- Weapon grid organized by selected categorization
- Selected weapons shown in a row above the grid
- Each selected weapon displays: main weapon icon, sub weapon icon, special weapon icon
- X button positioned at top-right of each selected weapon

## Acceptance Criteria
- Can select up to 4 weapons
- Can switch between categorization modes
- Selected weapons show all 3 icons (main/sub/special)
- Can remove weapons with X button
- Selection persists in URL