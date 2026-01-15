---
# sendou.ink-4m76
title: Add browser tests for combo charts
status: todo
type: task
created_at: 2026-01-15T19:19:14Z
updated_at: 2026-01-15T19:19:14Z
parent: sendou.ink-knt5
---

## Description
Write browser tests for the damage combo bar rendering.

## Tasks
- [ ] Create `components/DamageComboBar.browser.test.tsx`
- [ ] Test visual rendering:
  - Correct segment colors by slot position
  - 100 damage threshold line positioning
  - Weapon icons appear in segments
  - Damage values and type names display
  - Total damage and hit count display
- [ ] Test 80-99.9 combo display:
  - Ink time shows with IRU icon
- [ ] Test sub defense display:
  - AP value shows for sub weapon combos

## Acceptance Criteria
- Visual regression tests for combo bar component
- Tests pass with `npm run test:unit:browser`