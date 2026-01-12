---
# sendou.ink-ylq5
title: Tournament Prestige System
status: draft
type: epic
priority: normal
created_at: 2026-01-12T08:49:28Z
updated_at: 2026-01-12T08:49:38Z
blocking:
    - sendou.ink-r6ry
---

Algorithm for calculating tournament prestige based on registered players' seeding power. Used for stream ranking and potentially other features like player profiles and historical rankings.

## Why

The community lacks a standardized way to define tournament importance. A stacked weekly can be as competitive as a named major, but naming alone doesn't reflect actual strength. Prestige should be derived from actual participant skill level.

## Algorithm Concept

Calculate prestige based on average seeding power of top 8 teams compared to a baseline. This needs experimentation to produce balanced and expected prestige values. Test with real production data to ensure we get the right algorithm for historic tournaments.

### Inputs
- Registered teams' seeding power (from existing seeding system)
- Focus on top 8 teams to represent tournament strength

### Outputs
- Prestige score/tier for the tournament
- Available from registration (not just after results)

## Additional Features

- Track prestige of tournament series across multiple editions
- Historical prestige data for recurring tournaments

## Use Cases

1. **Stream ranking**: Higher prestige tournaments get priority in sidebar
2. **Player profiles**: Show participation in high-prestige events
3. **Leaderboards**: Weight tournament results by prestige
4. **Historical records**: Track which events were truly significant

## Open Questions

- What baseline to compare against?
- How to handle team count variance (16-team vs 128-team)?
- Should there be discrete tiers or continuous scores?
- How to weight recent vs historical editions for series prestige?

## Child Tasks

Research and implementation tasks (sequential order):

1. sendou.ink-24f6: Analyze tournament seeding data distribution
2. sendou.ink-h9ht: Design and test prestige formula
3. sendou.ink-10ai: Implement prestige calculation
