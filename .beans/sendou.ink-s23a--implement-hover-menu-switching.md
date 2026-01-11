---
# sendou.ink-s23a
title: Implement hover menu switching
status: draft
type: task
priority: normal
created_at: 2026-01-11T08:58:55Z
updated_at: 2026-01-11T19:06:55Z
parent: sendou.ink-6eko
---

After clicking to open a menu, moving cursor to another menu item should show that menu's items. Menu should close on outside click or Escape key. Location: app/components/layout/TopNavMenus.tsx:14

## Blocked

React Aria Components doesn't make this easy currently. See: https://github.com/adobe/react-spectrum/issues/8905