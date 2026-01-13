---
# sendou.ink-vd9w
title: Migration from trust to friendship
status: todo
type: task
created_at: 2026-01-13T09:33:20Z
updated_at: 2026-01-13T09:33:20Z
parent: sendou.ink-255r
---

## Overview

Migrate existing TrustRelationship data to new Friendship system.

## Migration Logic

```sql
-- Find mutual trusts (A trusts B AND B trusts A)
-- Convert to friendships

INSERT INTO Friendship (userOneId, userTwoId, createdAt)
SELECT 
  CASE WHEN t1.trustGiverUserId < t1.trustReceiverUserId 
       THEN t1.trustGiverUserId 
       ELSE t1.trustReceiverUserId END,
  CASE WHEN t1.trustGiverUserId < t1.trustReceiverUserId 
       THEN t1.trustReceiverUserId 
       ELSE t1.trustGiverUserId END,
  MIN(t1.lastUsedAt)
FROM TrustRelationship t1
JOIN TrustRelationship t2 
  ON t1.trustGiverUserId = t2.trustReceiverUserId 
  AND t1.trustReceiverUserId = t2.trustGiverUserId
WHERE t1.trustGiverUserId < t1.trustReceiverUserId
GROUP BY 1, 2;

-- Delete all trust relationships (mutual converted, one-way discarded)
DELETE FROM TrustRelationship;
```

## Approach

1. Create migration script (not DB migration - one-time data migration)
2. Run on staging first
3. Verify friendship counts match expected
4. Run on production
5. Keep TrustRelationship table temporarily for rollback
6. Remove table in later migration after confirming stability

## Checklist

- [ ] Create migration script
- [ ] Test on development database
- [ ] Count mutual trusts before migration
- [ ] Verify friendship count after migration
- [ ] Test on staging
- [ ] Run on production
- [ ] Monitor for issues