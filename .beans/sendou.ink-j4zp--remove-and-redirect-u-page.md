---
# sendou.ink-j4zp
title: Remove and redirect /u page
status: completed
type: task
priority: normal
created_at: 2026-01-11T08:58:56Z
updated_at: 2026-01-11T14:08:47Z
parent: sendou.ink-6eko
---

## Summary

Deprecate and remove the /u page. The /u page is a user search page that should be replaced by the CommandPalette search modal.

## Approach

Add URL search params to CommandPalette to allow opening it via a direct link:
- `?search=open` - opens the CommandPalette modal
- `?q=<query>` - pre-fills the search query
- `?type=users|teams|organizations|tournaments` - sets the search type

Then redirect /u to /?search=open&type=users (preserving any existing `q` param).

## Files involved

- `app/components/layout/CommandPalette.tsx` - add search param support
- `app/features/user-search/routes/u.tsx` - replace with redirect
- `app/features/user-search/loaders/u.server.ts` - can be removed
- `routes.ts` - update route to use redirect
- navIconUrl (png and avif files)

## Checklist

- [x] Add search param support to CommandPalette (`search`, `q`, `type` params)
- [x] Update /u route to redirect to /?search=open&type=users
- [x] Remove unused loader and route components
- [x] Remove any reference to u navIcon including breadcrumbs
- [x] Remove from nav (was not in nav)
- [ ] Test the redirect works correctly
- [x] Run checks to ensure everything passes

## Additional changes

- Updated `UserSearch` component to use `/search` API instead of `/u`
- Removed `USER_SEARCH_PAGE` constant from urls.ts
- Removed "u" nav item from `nav-items.ts` and `TopNavMenus.tsx`
