---
# sendou.ink-sqw4
title: Add E2E tests for page interactions
status: todo
type: task
created_at: 2026-01-15T19:19:22Z
updated_at: 2026-01-15T19:19:22Z
parent: sendou.ink-knt5
---

## Description
Write minimal E2E tests for the composition analyzer page.

## Tasks
- [ ] Create `e2e/comp-analyzer.spec.ts`
- [ ] Test navigation:
  - Page loads at /comp-analyzer
- [ ] Test weapon selection:
  - Can select weapons
  - Can remove weapons
  - Selection limited to 4
- [ ] Test combo display:
  - Combos appear when 2+ weapons selected
  - No combos with single weapon
- [ ] Test filtering:
  - Radio buttons work (when 3+ weapons)
  - IRU slider affects results

## Notes
- Keep tests minimal as specified
- Use `navigate` function, not `page.goto`
- Use `submit` function for form submissions

## Acceptance Criteria
- Basic user flows covered
- Tests pass with `npm run test:e2e`