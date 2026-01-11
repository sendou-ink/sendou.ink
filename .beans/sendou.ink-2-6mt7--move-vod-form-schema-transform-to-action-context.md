---
# sendou.ink-2-6mt7
title: Move vod form schema transform to action context
status: todo
type: task
created_at: 2026-01-11T08:47:55Z
updated_at: 2026-01-11T08:47:55Z
---

The vodFormSchemaServer does a full data mapping in transform which is unusual. This mapping should be done in the action context instead.

## Context
Located at app/features/vods/vods-schemas.server.ts:37

The transform maps all form data fields which is not done in other schemas - transformations should happen in the action.

## Checklist
- [ ] Move the transform logic to the vods action
- [ ] Simplify vodFormSchemaServer to just validate
- [ ] Ensure the action handles the data transformation