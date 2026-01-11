---
# sendou.ink-2-hit1
title: Restyle TimeRangeFormField to inline layout
status: scrapped
type: task
priority: normal
created_at: 2026-01-11T08:31:33Z
updated_at: 2026-01-11T18:26:53Z
---

Change TimeRangeFormField from labeled sections to inline layout: 'from [input] to [input]'

## Context
Located at app/form/fields/TimeRangeFormField.tsx:17

Current layout has separate labeled inputs. New layout should be more compact with inline 'from' and 'to' text.

## Checklist
- [ ] Update TimeRangeFormField component layout
- [ ] Add/update CSS for inline styling
- [ ] Ensure accessibility is maintained (proper labels/aria)
