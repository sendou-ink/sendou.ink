---
# sendou.ink-yg4i
title: Implement sidebar collapse/expand
status: todo
type: task
created_at: 2026-01-11T09:28:55Z
updated_at: 2026-01-11T09:28:55Z
parent: sendou.ink-6eko
---

## Feature

Allow users to collapse the sidebar to show icons only, giving more horizontal space to content.

## Behavior

- Collapsed state shows just icons for each section (profile, calendar, friends, streams)
- User can toggle between collapsed and expanded states
- Should persist preference (localStorage or user settings)

## Considerations

- Toggle button placement (in sidebar header? floating?)
- Animation/transition when collapsing
- Tooltip on hover for collapsed icons
- Keyboard shortcut to toggle?
- Mobile: does this apply or is mobile handled differently?