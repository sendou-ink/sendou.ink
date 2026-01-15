---
# sendou.ink-rt6t
title: Add unit tests for damage calculations
status: todo
type: task
created_at: 2026-01-15T19:19:08Z
updated_at: 2026-01-15T19:19:08Z
parent: sendou.ink-knt5
---

## Description
Write comprehensive unit tests for the damage combination calculation logic.

## Tasks
- [ ] Create `core/damage-combinations.test.ts`
- [ ] Test combo generation:
  - Correct number of combinations generated
  - Proper filtering of single-weapon combos
  - Respect for 3 damage type limit
  - Respect for 2 repeat limit per damage type
- [ ] Test damage totals:
  - Accurate sum of damage values
  - Correct hit count
- [ ] Test sorting:
  - Results sorted by lowest damage first
- [ ] Test 50 combo cap:
  - No more than 50 results returned
- [ ] Test ink time calculations:
  - Correct time for various Ink Resistance values
  - Edge cases (ink cap, grace period)
- [ ] Test sub defense calculations:
  - Correct AP breakpoints
  - Only appears for sub weapon combos

## Test Cases
```typescript
describe("damage combinations", () => {
  it("should not include single-weapon combos");
  it("should limit to 3 different damage types");
  it("should allow max 2 repeats of same damage type");
  it("should sort by lowest damage first");
  it("should cap at 50 results");
  it("should calculate ink time for 80-99.9 combos");
  it("should calculate sub defense counter AP");
});
```

## Acceptance Criteria
- All core calculation logic has test coverage
- Tests pass with `npm run test:unit:browser`