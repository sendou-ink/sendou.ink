---
# sendou.ink-takt
title: Mobile menu doesn't block background scrolling
status: todo
type: bug
created_at: 2026-01-11T18:39:55Z
updated_at: 2026-01-11T18:39:55Z
parent: sendou.ink-1l22
---

The mobile menu doesn't actually block scrolling the container when open. This might be a bug with our react-aria components scroll lock workaround.

## Context
- Mobile menu should prevent background content from scrolling when open
- Current react-aria scroll lock implementation may not be working correctly

## Investigation needed
- Check the current scroll lock workaround implementation
- Verify if this is a react-aria issue or our custom code
- Test on different mobile browsers