---
# sendou.ink-h9ht
title: Design and test prestige formula
status: todo
type: task
priority: normal
created_at: 2026-01-12T09:21:17Z
updated_at: 2026-01-12T09:21:23Z
parent: sendou.ink-ylq5
blocking:
    - sendou.ink-10ai
---

Experiment with different prestige calculation formulas using real tournament data.

## Algorithm Concept (from epic)

Calculate prestige based on average seeding power of top 8 teams compared to a baseline.

## Variables to Experiment With

- Which teams to consider (top 8? top 4? all teams?)
- Baseline value (median of all tournaments? fixed threshold?)
- Team count weighting (16-team vs 128-team handling)
- Continuous score vs discrete tiers

## Test Cases

Run formula against known tournaments and verify results match intuition:
- Major community tournaments (should be high prestige)
- Regular weeklies (should be medium)
- Casual/new tournaments (should be lower)

## Output

- Documented formula with rationale
- Test results showing formula produces expected rankings
- Configuration constants for tuning

## Dependencies

- Seeding data analysis (sendou.ink-XXX) for understanding data distribution