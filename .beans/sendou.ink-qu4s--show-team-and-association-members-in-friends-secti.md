---
# sendou.ink-qu4s
title: Show team and association members in friends section
status: todo
type: feature
created_at: 2026-01-16T10:20:57Z
updated_at: 2026-01-16T10:20:57Z
parent: sendou.ink-255r
---

Extend the friends section in the sidebar to also display:
- Team members (from the user's team)
- Association members (from the user's association)

## Sorting priority
Friends should appear first in the list, followed by team members, then association members.

## Checklist
- [ ] Query team members for the current user
- [ ] Query association members for the current user  
- [ ] Combine friends, team members, and association members into a single list
- [ ] Implement sorting logic: friends first, then team, then association
- [ ] Handle duplicate entries (e.g., a friend who is also a team member should only appear once, as a friend)
- [ ] Update sidebar UI to display the combined list