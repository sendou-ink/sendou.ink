---
# sendou.ink-wp5x
title: User search has nested input borders
status: todo
type: bug
created_at: 2026-01-11T13:54:26Z
updated_at: 2026-01-11T13:54:26Z
parent: sendou.ink-1l22
---

The user search component displays an 'input inside input' visual issue - there's an outer border around the whole search container and an inner border around the actual text input, creating an unintended nested appearance.

## Details

- Visible on the admin page 'User to log in as' search
- Likely affects other places using the same UserSearch component
- Should have a single cohesive input appearance, not nested borders