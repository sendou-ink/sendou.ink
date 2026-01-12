---
# sendou.ink-24f6
title: Analyze tournament seeding data distribution
status: todo
type: task
priority: normal
created_at: 2026-01-12T09:21:17Z
updated_at: 2026-01-12T09:21:23Z
parent: sendou.ink-ylq5
blocking:
    - sendou.ink-h9ht
---

Research task: Analyze existing tournament data to understand seeding skill distributions.

## Goals

- Understand the range and distribution of avgSeedingSkillOrdinal values
- Identify what distinguishes 'stacked' tournaments from casual ones
- Find natural breakpoints for prestige tiers
- Compare team counts vs skill levels

## Data to Analyze

- All finalized tournaments (RANKED and UNRANKED)
- Top 8 teams' average seeding skill ordinal
- Distribution across different tournament sizes

## Output

- Report with findings
- Recommendations for baseline comparison value
- Suggested tier boundaries (if discrete tiers make sense)

## Implementation Notes

- Can use db-prod.sqlite3 for real data
- Write analysis script or SQL queries
- Consider visualizing distributions