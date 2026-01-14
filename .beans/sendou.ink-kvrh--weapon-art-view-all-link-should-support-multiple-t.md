---
# sendou.ink-kvrh
title: Weapon art 'View all' link should support multiple tag variations
status: todo
type: task
created_at: 2026-01-14T16:01:57Z
updated_at: 2026-01-14T16:01:57Z
---

The WeaponArtPreview component's 'View all' link currently only links to one tag (the slug with hyphens, e.g. `/art?tag=luna-blaster`). However, the art query searches for multiple tag variations (hyphens, spaces, underscores).

Consider:
- Updating the art page to support multiple tag filters
- Or showing all matching tag variations in the link
- Or consolidating duplicate tags in the database

Related: WeaponArtPreview component in app/features/weapons/components/WeaponArtPreview.tsx