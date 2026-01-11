---
# sendou.ink-2-kkm8
title: Migrate reused translation keys to common/forms namespace
status: todo
type: task
created_at: 2026-01-11T08:47:57Z
updated_at: 2026-01-11T08:47:57Z
---

Check from main branch what translation keys already exist and migrate translations over even if they now exist under different keys. Consolidate duplicated keys.

## Context
Located at app/utils/i18n.ts:5

## Checklist
- [ ] Compare current translations with main branch
- [ ] Identify keys that were already translated
- [ ] Migrate existing translations to appropriate namespace
- [ ] Remove duplicate keys across namespaces
- [ ] Run npm run i18n:sync after changes