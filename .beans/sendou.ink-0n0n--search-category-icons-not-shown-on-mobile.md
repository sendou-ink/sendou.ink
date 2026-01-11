---
# sendou.ink-0n0n
title: Search category icons not shown on mobile
status: completed
type: bug
priority: normal
created_at: 2026-01-11T13:53:16Z
updated_at: 2026-01-11T18:43:48Z
parent: sendou.ink-6eko
---

On narrow screens, the search/command palette category tabs (Users, Teams, Organizations, Tournaments) only show text labels without their icons. Icons should be visible on mobile to maintain visual consistency and improve scannability.

## Details

- The tabs currently show text-only on narrow screens
- Icons help users quickly identify categories
- Should match desktop behavior where icons are shown alongside text

## Fix

Added CSS in `CommandPalette.module.css`:

1. Added `flex-shrink: 0` to `picture` and `img` elements inside `.searchTypeRadio` to prevent icons from being compressed/hidden on narrow screens
2. Added `flex-wrap: wrap` to `.searchTypeRadioGroup` to allow tabs to wrap to a new line on very narrow screens instead of overflowing