---
# sendou.ink-reks
title: Define sidebar loading behavior
status: completed
type: task
priority: normal
created_at: 2026-01-11T09:27:48Z
updated_at: 2026-01-25T12:08:55Z
parent: sendou.ink-6eko
---

## Problem

Currently the sidebar shows empty/nothing while data loads, making the page appear broken briefly.

## Task

Define how the sidebar should behave when loading data:
- Should we show skeleton loaders?
- Should we show the previous cached data while fetching fresh data?
- Should we show a loading spinner?
- What about error states if the fetch fails?

## Current Implementation

- Sidebar uses a fetcher to load data on mount (`app/components/layout/index.tsx`)
- No loading or error states are shown
- If fetcher fails, error is silently ignored