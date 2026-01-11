---
# sendou.ink-2-phdi
title: Fix team name validation translation not applied
status: todo
type: bug
created_at: 2026-01-11T08:47:55Z
updated_at: 2026-01-11T08:47:55Z
---

The team name validation message 'forms:errors.noOnlySpecialCharacters' is not being translated.

## Context
Located at app/features/team/team-schemas.ts:14

## Checklist
- [ ] Verify the translation key exists in forms.json
- [ ] Check why the translation is not being applied
- [ ] Fix the translation mechanism
- [ ] Verify error displays translated message