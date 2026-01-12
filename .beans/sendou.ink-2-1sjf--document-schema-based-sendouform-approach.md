---
# sendou.ink-2-1sjf
title: Document schema-based SendouForm approach
status: todo
type: task
priority: normal
created_at: 2026-01-12T15:31:57Z
updated_at: 2026-01-12T15:36:31Z
---

Create comprehensive documentation of the new schema-based SendouForm architecture for both human developers and AI agents.

## Context

The form system has been refactored from React Hook Form to a declarative, schema-driven approach where:
1. Zod schemas define both validation AND UI metadata
2. Form fields are rendered automatically based on schema registration
3. Type safety is maintained through branded types and registry lookups

## Checklist
- [ ] Write documentation in CLAUDE.md or AGENTS.md
- [ ] Cover architecture overview
- [ ] Document field helper functions
- [ ] Explain the FormField component
- [ ] Show usage examples
- [ ] Document type-safe options pattern (FieldWithOptions)