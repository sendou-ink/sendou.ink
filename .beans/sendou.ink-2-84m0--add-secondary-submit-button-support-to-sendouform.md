---
# sendou.ink-2-84m0
title: Add secondary submit button support to SendouForm for apply+persist pattern
status: todo
type: feature
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-11T08:47:44Z
---

SendouForm should support a secondary submit button that persists to the server while the primary just applies locally. This pattern is used in filter dialogs.

## Context
Located at:
- app/features/calendar/components/FiltersDialog.tsx:70
- app/features/scrims/components/ScrimFiltersDialog.tsx:98 and :138

Currently the 'apply and persist' functionality requires manual fetcher.submit calls and a separate ApplyAndPersistButton component outside the form.

## Checklist
- [ ] Design API for secondary submit in SendouForm
- [ ] Implement secondary submit button option
- [ ] Update FiltersDialog to use the new API
- [ ] Update ScrimFiltersDialog to use the new API
- [ ] Remove manual fetcher.submit and ApplyAndPersistButton workarounds