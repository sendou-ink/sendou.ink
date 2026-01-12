---
# sendou.ink-js3r
title: Implement sidebar scoring algorithm
status: todo
type: feature
priority: normal
created_at: 2026-01-12T09:20:16Z
updated_at: 2026-01-12T09:21:32Z
parent: sendou.ink-r6ry
blocking:
    - sendou.ink-hw3x
---

Create the scoring algorithm that determines which streams appear in the sidebar (top 3).

## Scoring Principles

- Skill-based ranking only (NO viewer count)
- Configurable weights for easy tuning

## Scoring by Source

### Tournament streams
- Base: Tournament prestige score (from prestige epic)
- Bonus: Round progression (later rounds score higher)
- Fallback until prestige system: Simple heuristics (team count tiers)

### SendouQ streams  
- Score based on tier/peak XP
- Existing tier logic in /app/features/sendouq-streams/

### Calendar event streams
- Fixed score (e.g., 500 - tune based on testing)
- Simple approach for now, can add event-based scoring later

### Non-match streamers
- Score by peak XP from linked X rank account

## Daily Shuffle

- Seeded random by date (consistent order for the day)
- Higher skill weighted more heavily
- Lower skill still has chance to appear

Example algorithm:
```typescript
// Seed based on date for consistency
const seed = dateFns.startOfDay(new Date()).getTime();
const rng = seedrandom(seed.toString());

// Weighted shuffle: multiply score by random factor
const shuffled = streams.map(s => ({
  ...s,
  sortScore: s.score * (0.5 + rng() * 0.5) // 50-100% of score
}));
shuffled.sort((a, b) => b.sortScore - a.sortScore);
```

## Checklist

- [ ] Create `scoreStream()` function for individual stream scoring
- [ ] Create `rankStreams()` function that applies daily shuffle
- [ ] Define score constants at top of file (easy to tune)
- [ ] Add tournament fallback scoring (team count tiers until prestige exists)
- [ ] Add round progression bonus mapping
- [ ] Test with real data to verify reasonable distribution

## Score Constants (starting point)

```typescript
const SCORES = {
  // Tournament base by team count
  TOURNAMENT_16_PLUS: 1000,
  TOURNAMENT_8_PLUS: 800,
  TOURNAMENT_SMALL: 600,

  // Round bonuses
  ROUND_FINALS: 200,
  ROUND_SEMIS: 150,
  ROUND_QUARTERS: 100,

  // Calendar event (fixed)
  CALENDAR_EVENT: 500,

  // SendouQ by tier (use existing tier values)
  // Non-match: use peak XP directly (already ~1500-3000 range)
};
```

## Implementation Notes

- Make weights configurable (constants at top of file)
- Document the scoring formula clearly
- Lives in `/app/features/streams/scoring.server.ts`
- Consider A/B testing different weight configurations later