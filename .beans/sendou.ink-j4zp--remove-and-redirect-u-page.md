---
# sendou.ink-j4zp
title: Remove and redirect /u page
status: todo
type: task
priority: normal
created_at: 2026-01-11T08:58:56Z
updated_at: 2026-01-11T13:49:48Z
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

- [ ] Add search param support to CommandPalette (`search`, `q`, `type` params)
- [ ] Update /u route to redirect to /?search=open&type=users
- [ ] Remove unused loader and route components
- [ ] Remove any reference to u navIcon including breadcrumbs
- [ ] Remove from nav
- [ ] Test the redirect works correctly
- [ ] Run checks to ensure everything passes
