---
# sendou.ink-jy7s
title: Implement state management hook
status: todo
type: task
created_at: 2026-01-15T19:23:27Z
updated_at: 2026-01-15T19:23:27Z
parent: sendou.ink-knt5
---

## Description
Create the main state management hook using URL search params for persistence.

## Tasks
- [ ] Create `useCompAnalyzer` hook in `comp-analyzer-hooks.ts`
- [ ] Manage state via URL search params:
  - Selected weapon IDs (up to 4)
  - Categorization mode
  - Active filter (which weapon, or "all")
  - Ink Resistance AP value
  - Comp title (for screenshot)
- [ ] Derive computed values:
  - Weapon data for selected weapons
  - Calculated damage combinations
  - Filtered combinations based on active filter
- [ ] Provide change handlers:
  - Add/remove weapon
  - Change categorization
  - Change filter
  - Change IRU value
  - Change title

## Implementation Pattern
```typescript
export function useCompAnalyzer() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read state from URL
  const weaponIds = parseWeaponIds(searchParams);
  const categorization = searchParams.get("cat") ?? "category";
  const filter = searchParams.get("filter") ?? "all";
  const inkResistanceAP = Number(searchParams.get("iru") ?? 0);
  const title = searchParams.get("title") ?? "";
  
  // Compute derived data
  const combinations = useMemo(...); // Exception: needed for expensive calculation
  
  // Handlers
  const addWeapon = (id: MainWeaponId) => {...};
  const removeWeapon = (id: MainWeaponId) => {...};
  
  return { weaponIds, combinations, addWeapon, removeWeapon, ... };
}
```

## Acceptance Criteria
- All state persisted in URL
- Changes update URL with replace (no history spam)
- URL is shareable and loads correct state