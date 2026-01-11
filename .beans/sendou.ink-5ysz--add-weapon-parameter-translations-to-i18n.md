---
# sendou.ink-5ysz
title: Add weapon parameter translations to i18n
status: todo
type: task
created_at: 2026-01-11T12:22:15Z
updated_at: 2026-01-11T12:22:15Z
parent: sendou.ink-0ze4
---

## Summary

Add weapon parameter keys to the existing i18n translation system so raw parameter names can be displayed in human-readable form.

## Requirements

- Add new translation namespace or extend existing `weapons` namespace
- Map raw Leanny parameter keys to readable names
- Initially can be partial - untranslated keys display as-is
- Support incremental addition of translations over time

## Example

```json
{
  "params": {
    "DamageParam_ValueMax": "Max Damage",
    "DamageParam_ValueMin": "Min Damage",
    "MoveSpeed": "Movement Speed"
  }
}
```

## Technical Notes

- Run `npm run i18n:sync` after adding new English translations
- Keys should match exactly what comes from Leanny's data
- We should have a way to know in the table which keys have translation and which don't for conditional rendering
