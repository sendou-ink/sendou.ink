---
# sendou.ink-nucy
title: Consistent avatar border radius in sidebar
status: draft
type: feature
created_at: 2026-01-16T09:23:10Z
updated_at: 2026-01-16T09:23:10Z
---

Currently sidebar avatars have inconsistent border radius styles:
- Some are fully rounded (circle)
- Some are slightly rounded
- Some have no background/different treatment

## Idea

Add a theme option for avatar border radius that applies globally to all avatars:
- **round** - fully circular (border-radius: 50%)
- **rounded** - slightly rounded corners
- **square** - no border radius

This would provide visual consistency and give users control over their preferred avatar style.

## Alternative

Choose one and apply everywhere.

## Areas to check
- Tournament/event avatars in sidebar
- Friend list avatars
- User avatars throughout the app
- Team avatars

## Checklist
- [ ] Audit current avatar border radius usage across codebase
- [ ] Design CSS variable approach for avatar border radius
- [ ] Add theme option to settings
- [ ] Apply consistent border radius to all Avatar components
- [ ] Test across different contexts (sidebar, profiles, etc.)
