---
# sendou.ink-368p
title: Measure and optimize weapon params JSON performance
status: todo
type: task
created_at: 2026-01-13T15:23:48Z
updated_at: 2026-01-13T15:23:48Z
parent: sendou.ink-0ze4
---

The weapon params are loaded from a large JSON file and calculated at request time. Tasks:

## Checklist
- [ ] Measure the current performance penalty of loading/parsing the big JSON at request time
- [ ] Investigate if caching or pre-computation could improve performance
- [ ] Implement optimizations if the perf impact is significant