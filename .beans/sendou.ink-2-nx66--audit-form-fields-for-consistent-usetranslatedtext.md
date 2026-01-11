---
# sendou.ink-2-nx66
title: Audit form fields for consistent useTranslatedTexts usage
status: todo
type: task
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-11T08:31:33Z
---

Ensure all form field components use useTranslatedTexts for labels, errors, and bottom text consistently.

## Context
Located at app/form/fields/FormFieldWrapper.tsx:8

## Checklist
- [ ] Audit all form field components in app/form/fields/
- [ ] Identify components not using useTranslatedTexts
- [ ] Update components to use useTranslatedTexts consistently
- [ ] Verify translations work correctly after changes