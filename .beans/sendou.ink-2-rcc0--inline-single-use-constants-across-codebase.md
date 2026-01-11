---
# sendou.ink-2-rcc0
title: Inline single-use constants across codebase
status: todo
type: task
created_at: 2026-01-11T08:47:56Z
updated_at: 2026-01-11T08:47:56Z
---

Check all constants (scrims and other modified areas) - if a constant is only used in one place, inline it.

## Context
Located at app/features/scrims/scrims-constants.ts:16

## Checklist
- [ ] Audit SCRIM constants for single-use values
- [ ] Audit other modified constant files
- [ ] Inline constants that are only used once
- [ ] Keep constants that are used in multiple places