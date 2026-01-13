---
# sendou.ink-kluy
title: Deprecate TrustRelationship table
status: todo
type: task
created_at: 2026-01-13T09:33:39Z
updated_at: 2026-01-13T09:33:39Z
parent: sendou.ink-255r
---

## Overview

Final cleanup: remove TrustRelationship table after migration is stable.

## Prerequisites

- Migration complete (sendou.ink-vd9w)
- All trust-dependent features updated (sendou.ink-gdrp)
- Stable in production for at least 1 week

## Steps

1. Remove TrustRelationship from `app/db/tables.ts`
2. Create migration to drop table
3. Remove `app/features/tournament/queries/giveTrust.server.ts`
4. Remove `app/routines/deleteOldTrusts.ts`
5. Remove any remaining trust-related code
6. Update tests

## Checklist

- [ ] Confirm migration stable in production
- [ ] Remove table definition from tables.ts
- [ ] Create DROP TABLE migration
- [ ] Remove giveTrust.server.ts
- [ ] Remove deleteOldTrusts.ts routine
- [ ] Search and remove remaining trust code
- [ ] Update/remove trust-related tests