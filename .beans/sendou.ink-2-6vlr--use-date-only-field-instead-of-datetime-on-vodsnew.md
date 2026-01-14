---
# sendou.ink-2-6vlr
title: Use date-only field instead of datetime on vods.new page
status: todo
type: task
created_at: 2026-01-14T07:49:28Z
updated_at: 2026-01-14T07:49:28Z
---

The Video date field on the VOD form currently uses a datetime picker (showing date + time like '2/6/2026,12:00AM'). Since only the date matters for VODs, this should use a date-only field instead.

## Context
- File: app/features/vods/vods-schemas.ts
- Current: `datetimeRequired` helper
- Should use: a date-only field helper (may need to create `dateRequired` helper in fields.ts)

## Checklist
- [ ] Add `dateRequired` and/or `dateOptional` helpers to fields.ts (if not exists)
- [ ] Update vods-schemas.ts to use date field instead of datetime
- [ ] Verify form renders date-only picker