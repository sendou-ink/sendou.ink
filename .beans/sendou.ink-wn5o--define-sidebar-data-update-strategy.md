---
# sendou.ink-wn5o
title: Define sidebar data update strategy
status: todo
type: task
created_at: 2026-01-11T09:27:58Z
updated_at: 2026-01-11T09:27:58Z
parent: sendou.ink-6eko
---

## Problem

Currently the sidebar fetches fresh data every time the Layout mounts. Need to define when and how sidebar data should be updated.

## Questions to Answer

- When should sidebar data be refreshed? (On every navigation? On a timer? Only on specific actions?)
- Should we use polling for real-time updates (e.g., friend online status, new tournaments)?
- What data needs to stay fresh vs. can be cached longer?
- How do we invalidate the cache when user takes actions (e.g., joins a tournament)?

## Current Implementation

- Sidebar fetches on mount via `useFetcher` (`app/components/layout/index.tsx:76-86`)
- No cache invalidation strategy exists
- Could cause excessive requests on rapid navigation