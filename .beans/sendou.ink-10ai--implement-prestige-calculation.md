---
# sendou.ink-10ai
title: Implement prestige calculation
status: todo
type: feature
created_at: 2026-01-12T09:21:18Z
updated_at: 2026-01-12T09:21:18Z
parent: sendou.ink-ylq5
---

Implement the tournament prestige calculation based on research findings.

## Requirements

- Calculate prestige from registered teams' seeding power
- Available at registration time (not just after results)
- Works for both upcoming and historical tournaments

## Implementation Notes

- Create function in /app/features/tournament/ or /app/features/mmr/
- Query top N teams' avgSeedingSkillOrdinal
- Apply formula from design task
- Return prestige score/tier

## Usage

- Called by stream aggregation service for ranking
- May be displayed on tournament pages (future)
- May be stored for historical tracking (future)

## Dependencies

- Prestige formula design (sendou.ink-XXX)