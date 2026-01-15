---
# sendou.ink-2-gtmy
title: Split SendouSelect into base Select and SelectFormField wrapper
status: scrapped
type: task
priority: normal
created_at: 2026-01-11T08:47:57Z
updated_at: 2026-01-15T18:57:04Z
---

Refactor SendouSelect to be a pure Select component, with SelectFormField adding the label and BottomTexts wrapper.

## Context
Located at app/components/elements/Select.tsx:69

This separates concerns - pure Select component vs form-aware wrapper.

## Checklist
- [ ] Create base Select component without form-specific props
- [ ] Create SelectFormField that wraps Select with label/bottomText
- [ ] Update usages to use appropriate component
- [ ] Ensure backwards compatibility or update all consumers