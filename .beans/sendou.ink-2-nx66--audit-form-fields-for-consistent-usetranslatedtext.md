---
# sendou.ink-2-nx66
title: Audit form fields for consistent useTranslatedTexts usage
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-17T05:58:56Z
---

Ensure all form field components use useTranslatedTexts for labels, errors, and bottom text consistently.

## Context
Located at app/form/fields/FormFieldWrapper.tsx:8

## Checklist
- [x] Audit all form field components in app/form/fields/
- [x] Identify components not using useTranslatedTexts
- [x] Fix SwitchFormField - duplicates translation, double translates via FormFieldMessages
- [x] Delete ImageFormField - unused component
- [x] Delete MapPoolFormField - unused component
- [x] Fix StageSelectFormField - passes translatedError to FormFieldMessages (double translation)
- [x] Fix WeaponSelectFormField - passes translatedError to FormFieldMessages (double translation)
- [x] Verify translations work correctly after changes