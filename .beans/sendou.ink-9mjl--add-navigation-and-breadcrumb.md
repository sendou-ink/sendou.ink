---
# sendou.ink-9mjl
title: Add navigation and breadcrumb
status: todo
type: task
created_at: 2026-01-15T19:23:34Z
updated_at: 2026-01-15T19:23:34Z
parent: sendou.ink-knt5
---

## Description
Add the composition analyzer to the site navigation.

## Tasks
- [ ] Create or select nav icon for comp-analyzer (can use temporary one for now, make a copy of the build analyzer icon)
- [ ] Add breadcrumb configuration in route handle
- [ ] Add link to navigation menu (if applicable)
- [ ] Create `COMP_ANALYZER_PAGE` URL constant

## Route Handle Pattern
```typescript
export const handle: SendouRouteHandle = {
  i18n: ["comp-analyzer", "weapons", "analyzer"],
  breadcrumb: () => ({
    imgPath: navIconUrl("comp-analyzer"),
    href: COMP_ANALYZER_PAGE,
    type: "IMAGE",
  }),
};
```

## Acceptance Criteria
- Feature is accessible from site navigation
- Breadcrumb displays correctly
