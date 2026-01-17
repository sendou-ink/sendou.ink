---
# sendou.ink-hp3s
title: Implement Ink Damage Time Calculation
status: completed
type: feature
priority: normal
created_at: 2026-01-17T13:15:10Z
updated_at: 2026-01-17T13:18:07Z
---

Calculate how long an enemy must stand in ink for 80-99.9 damage combos to become lethal (100+ damage). Adds InkTimeResult type and calculateInkTimeToKill function.

## Checklist
- [x] Add InkTimeResult type to comp-analyzer-types.ts
- [x] Add calculateInkTimeToKill function to damage-combinations.ts
- [x] Add unit tests for calculateInkTimeToKill
- [x] Run npm run typecheck
- [x] Run npm run test:unit:browser
- [x] Run npm run biome:fix