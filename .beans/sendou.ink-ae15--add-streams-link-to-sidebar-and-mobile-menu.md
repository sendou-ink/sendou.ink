---
# sendou.ink-ae15
title: Add /streams link to sidebar and mobile menu
status: todo
type: task
created_at: 2026-01-12T09:20:56Z
updated_at: 2026-01-12T09:20:56Z
parent: sendou.ink-r6ry
---

Add navigation link to the new /streams page.

## Requirements

- Add link in sidebar streams section (below the top 3 streams)
- Add to mobile menu in appropriate location
- Link text: "All streams" (or localized equivalent)

## Checklist

- [ ] Add link in desktop sidebar after stream cards (`/app/components/layout/index.tsx`)
- [ ] Add link in mobile menu streams section (`/app/components/MobileNav.tsx`)
- [ ] Add i18n translation key: `common:nav.allStreams` = "All streams"
- [ ] Run `npm run i18n:sync` after adding translation
- [ ] Style link consistently with other section links

## Implementation

Desktop sidebar (in layout/index.tsx):
```tsx
<SideNavHeader icon={<TwitchIcon />}>Streams</SideNavHeader>
{streams.map(stream => <SideNavLink ... />)}
<Link to="/streams" className="...">All streams →</Link>
```

Mobile menu (in MobileNav.tsx):
```tsx
// In MenuOverlay streams section
{streams.map(stream => ...)}
<Link to="/streams">All streams</Link>
```

OR

inline link (the header becomes link) prompt user for resolution (TBD)

## Notes

- Should appear after the stream cards, not before
- Use right arrow or chevron icon to indicate "see more"
- Same pattern will be used for "Events" and "Friends" sections later

## Dependencies

- sendou.ink-9cpl: /streams page must exist first
