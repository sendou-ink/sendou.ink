---
# sendou.ink-gjie
title: Create parameter comparison table component
status: completed
type: task
priority: normal
created_at: 2026-01-11T12:22:15Z
updated_at: 2026-01-13T12:21:54Z
parent: sendou.ink-0ze4
---

## Summary

Create a React component that displays weapon parameters in a comparison table format. Use `Table` component

## Design

- **Rows** = parameters (raw keys, translated via i18n if available)
- **Columns** = weapons in same category (e.g., all shooters)
- **Current weapon pinned** - always visible, visually highlighted
- **Patch history inline** - cells show current value + indicator if changed, expandable to see full history (patch + date)

## Props

- `weaponId` - current weapon
- `categoryWeapons` - list of weapons in same category
- `params` - parameter data with patch history

## Technical Notes

- Use CSS modules for styling
- Consider horizontal scroll for many weapons
- Expandable rows for patch history (click to expand)
- Changed values should have visual indicator (icon or color)
