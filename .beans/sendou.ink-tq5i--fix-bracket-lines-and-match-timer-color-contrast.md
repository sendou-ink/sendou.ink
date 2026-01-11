---
# sendou.ink-tq5i
title: Fix bracket lines and match timer color contrast
status: todo
type: bug
created_at: 2026-01-11T09:36:11Z
updated_at: 2026-01-11T09:36:11Z
parent: sendou.ink-1l22
---

## Problem

On the tournament bracket page, the bracket connector lines and match timer badge blend together because they use the same or very similar colors. This makes it difficult to visually distinguish the timer from the bracket structure.

## Screenshot

The timer showing "0m" and the bracket lines are both a similar gray/muted color, reducing visual clarity.

## Expected behavior

The bracket lines and match timer should have distinct colors so they're easily distinguishable at a glance.

## Acceptance criteria

- Bracket connector lines and match timer have sufficient color contrast between them
- Both elements remain accessible and readable
- Fits within the new CSS variable system in `vars.css`