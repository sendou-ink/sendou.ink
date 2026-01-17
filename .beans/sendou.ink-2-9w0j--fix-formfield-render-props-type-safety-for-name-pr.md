---
# sendou.ink-2-9w0j
title: Fix FormField render props type safety for name prop
status: completed
type: bug
priority: normal
created_at: 2026-01-17T09:14:47Z
updated_at: 2026-01-17T09:17:19Z
---

The FormField component passed via render props to SendouForm lacks type safety for the 'name' prop. A typo like 'moes' instead of 'modes' doesn't produce a TypeScript error. Need to make the name prop properly typed based on the schema.