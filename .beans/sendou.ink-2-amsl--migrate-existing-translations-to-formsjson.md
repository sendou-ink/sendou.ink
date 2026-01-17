---
# sendou.ink-2-amsl
title: Migrate existing translations to forms.json
status: completed
type: task
priority: normal
created_at: 2026-01-17T20:03:44Z
updated_at: 2026-01-17T20:09:45Z
---

Create a TypeScript script to migrate ~60 mappable translations across 15 languages from various namespace files (vods.json, builds.json, scrims.json, calendar.json, team.json, org.json, common.json) to the new forms.json namespace.

## Checklist
- [x] Create migration script at scripts/migrate-form-translations.ts
- [x] Execute script for all 15 languages
- [x] Run npm run i18n:sync
- [x] Run npm run checks
- [x] Spot-check Japanese and German forms.json