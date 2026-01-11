---
# sendou.ink-kw6u
title: Show scrims in My calendar
status: todo
type: task
priority: normal
tags:
    - my-calendar-epic
created_at: 2026-01-11T09:44:26Z
updated_at: 2026-01-11T11:45:42Z
parent: sendou.ink-6eko
---

## Summary

Display scrims (both scheduled and looking-for-match) in the sidebar's "My calendar" section.

## Details

The My calendar section currently shows tournament calendar entries. It should also include:

1. **Scheduled scrims** - Scrims where the user's team has a confirmed match scheduled
2. **Looking-for-match scrims** - Active scrim postings where user's team is still searching for opponents

This gives competitive players visibility into their upcoming scrim commitments directly from the sidebar, reducing the need to navigate to a separate scrims page.

## Checklist

- [ ] Identify where scrim data is fetched/stored
- [ ] Add scrim entries to My calendar data source
- [ ] Distinguish between scheduled vs looking-for-match scrims visually
- [ ] Test with various scrim states