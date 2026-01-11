---
# sendou.ink-5d8q
title: Show notification dot on mobile You tab
status: completed
type: bug
priority: normal
created_at: 2026-01-11T13:06:55Z
updated_at: 2026-01-11T19:13:22Z
parent: 6eko
---

## Problem

The desktop sidebar shows a notification indicator dot when there are unseen notifications, but the mobile "You" tab in the bottom navigation does not have this indicator.

## Expected behavior

The mobile "You" tab should display a notification dot when there are unseen notifications, matching the desktop behavior.

## Location

- Mobile tab bar: `app/components/MobileNav.tsx` (MobileTabBar component)
- Desktop notification indicator for reference: `app/components/layout/index.tsx`