---
# sendou.ink-utog
title: Update user-pickable themes to use new CSS vars
status: todo
type: task
created_at: 2026-01-11T09:49:34Z
updated_at: 2026-01-11T09:49:34Z
parent: sendou.ink-1l22
---

## Summary

User profile pages and team pages allow custom theme colors. These need to be updated to work with the new CSS variable system from the CSS rework.

## Affected areas

- **User pages** - Profile customization with user-selected colors
- **Team pages** - Team branding colors

## Checklist

- [ ] Audit current user theme implementation
- [ ] Map old theme values to new CSS variable system
- [ ] Update user page theme application logic
- [ ] Update team page theme application logic
- [ ] Test custom themes don't break with new CSS structure
- [ ] Ensure theme picker UI works correctly