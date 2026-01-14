---
# sendou.ink-2-84m0
title: Add secondary submit button support to SendouForm for apply+persist pattern
status: completed
type: feature
priority: normal
created_at: 2026-01-11T08:47:44Z
updated_at: 2026-01-14T10:10:20Z
---

SendouForm should support a secondary submit button that persists to the server while the primary just applies locally. This pattern is used in filter dialogs.

## Context
Located at:
- app/features/calendar/components/FiltersDialog.tsx:70
- app/features/scrims/components/ScrimFiltersDialog.tsx:98 and :138

Currently the 'apply and persist' functionality requires manual fetcher.submit calls and a separate ApplyAndPersistButton component outside the form.

## Checklist
- [x] Design API for secondary submit in SendouForm
- [x] Implement secondary submit button option
- [x] Update FiltersDialog to use the new API
- [x] Update ScrimFiltersDialog to use the new API
- [x] Remove manual fetcher.submit and ApplyAndPersistButton workarounds