---
# sendou.ink-g01q
title: Explore more comfortable way to close mobile tab menu panels
status: todo
type: task
created_at: 2026-01-15T19:19:30Z
updated_at: 2026-01-15T19:19:30Z
---

The X button to close mobile tab menu panels is positioned far out of reach, making it uncomfortable to use.

## Potential solution
React Aria's Sheet component might be a good approach: https://react-aria.adobe.com/examples/sheet

This would allow swipe-to-dismiss gestures which are more ergonomic on mobile.

## Trade-offs
- Pro: Better UX with swipe gestures
- Con: Requires pulling in a new dependency (Motion)