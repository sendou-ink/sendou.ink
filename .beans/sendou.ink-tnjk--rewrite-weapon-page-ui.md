---
# sendou.ink-tnjk
title: Rewrite weapon page UI
status: todo
type: task
created_at: 2026-01-11T12:23:05Z
updated_at: 2026-01-11T12:23:05Z
parent: sendou.ink-0ze4
---

## Summary

Replace the existing placeholder weapon page with the new design using all created components.

## Components to Integrate

- Weapon header (image, name)
- Stats summary (top XP holder, popularity)
- Quick links
- Parameter comparison table
- Recent vods preview (5)
- Popular builds preview (5)
- Art preview (5)

## Requirements

- Replace existing `/app/features/weapons/routes/weapons.$slug.tsx`
- Well-componentized - each section in its own component for easy reordering
- Use CSS modules for styling
- Responsive design (desktop + mobile)

## Technical Notes

- Import data from rewritten loader
- Each section component receives props from loader data
- Handle empty states gracefully (e.g., "No art tagged for this weapon yet")
- Order of sections can be adjusted later - keep components decoupled