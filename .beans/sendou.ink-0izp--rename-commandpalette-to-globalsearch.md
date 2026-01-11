---
# sendou.ink-0izp
title: Rename CommandPalette to GlobalSearch
status: todo
type: task
created_at: 2026-01-11T13:51:15Z
updated_at: 2026-01-11T13:51:15Z
parent: sendou.ink-6eko
---

The CommandPalette component is used more as a global search feature than a command palette. Rename it to better reflect its purpose.

## Checklist

- [ ] Rename `CommandPalette.tsx` to `GlobalSearch.tsx`
- [ ] Rename `CommandPalette.module.css` to `GlobalSearch.module.css`
- [ ] Update all CSS class names from `commandPalette` to `globalSearch`
- [ ] Update all imports and references across the codebase
- [ ] Run checks to ensure nothing is broken