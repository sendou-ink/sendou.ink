---
# sendou.ink-xmun
title: Add damage type filtering to DamageComboBar
status: completed
type: feature
priority: normal
created_at: 2026-01-17T12:33:40Z
updated_at: 2026-01-17T12:35:29Z
---

Add interactive filtering to DamageComboBar component:
- Hovering over damage type label shows it as outlined
- Clicking filters out that damage type for that weapon/sub/special weapon ID
- Filtered damage types show at top and can be restored by clicking

## Checklist
- [x] Add state to track filtered damage types (keyed by weaponId + weapon type + damageType)
- [x] Add hover effect (outlined) CSS for damage type labels
- [x] Add click handler to filter out damage types
- [x] Show filtered damage types at the top with restore functionality
- [x] Add CSS styles for filtered items display