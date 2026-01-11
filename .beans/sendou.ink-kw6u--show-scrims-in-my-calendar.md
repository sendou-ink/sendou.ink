---
# sendou.ink-kw6u
title: Show scrims in Events
status: todo
type: task
priority: normal
tags:
    - my-events-epic
created_at: 2026-01-11T09:44:26Z
updated_at: 2026-01-11T12:51:46Z
parent: sendou.ink-6eko
---

## Summary

Display scrims (both scheduled and looking-for-match) in the sidebar's "Events" section.

## Details

The Events section currently shows tournament calendar entries. It should also include:

1. **Scheduled scrims** - Scrims where the user's team has a confirmed match scheduled
2. **Looking-for-match scrims** - Active scrim postings where user's team is still searching for opponents

This gives competitive players visibility into their upcoming scrim commitments directly from the sidebar, reducing the need to navigate to a separate scrims page.

## Checklist

- [ ] Identify where scrim data is fetched/stored
- [ ] Add scrim entries to Events data source
- [ ] Distinguish between scheduled vs looking-for-match scrims visually
- [ ] Test with various scrim states