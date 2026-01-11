---
# sendou.ink-p9v1
title: Create npm script to sync weapon params from Leanny/splat3
status: todo
type: task
created_at: 2026-01-11T12:22:15Z
updated_at: 2026-01-11T12:22:15Z
parent: sendou.ink-0ze4
---

## Summary

Create an npm script (`npm run sync-weapon-params`) that fetches weapon parameter data from https://github.com/Leanny/splat3 and transforms it into sendou.ink's format.

## Output Format

JSON files stored in the repo. For parameters that changed across patches, use patch-keyed format:

```json
{
  "damage": 36,
  "damage@5.0.0": 32,
  "damage@4.0.0": 30,
  "range": 50
}
```

- Plain key = current value
- `key@patch` = historical value from that patch

## Requirements

- Fetch data from Leanny's repo (all weapon categories)
- Track patch history by comparing versions
- Output one JSON file per weapon or per category (TBD based on Leanny's structure)
- Store in appropriate location (e.g., `app/features/weapons/data/`)

## Technical Notes

- Examine Leanny's repo structure to understand data format
- Script should be idempotent - running multiple times produces same result
- Consider storing patch metadata (dates) separately