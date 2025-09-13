# Swiss Early Advance/Defeat Variation Implementation Plan

## Overview
Implement a Swiss tournament variation where teams only play as many rounds as required to determine their advancement or elimination. Once a team reaches the required win/loss threshold, they stop playing additional rounds.

**Example**: In a 16-team Swiss stage:
- Teams that go 3-0, 3-1, or 3-2 advance to the next stage
- Teams that go 0-3, 1-3, or 2-3 are eliminated from the event
- Teams stop playing once they reach either threshold

## Current System Analysis

### Existing Swiss Implementation
- **File**: `app/features/tournament-bracket/core/Swiss.ts`
- **Current behavior**: All teams play all rounds (default 5 rounds)
- **Settings**: `groupCount` and `roundCount` in `TournamentStageSettings`
- **Pairing logic**: `generateMatchUps()` function creates new rounds after all matches are complete

### Key Components
1. **Swiss.ts**: Core Swiss tournament logic and match generation
2. **Bracket.ts**: Standings calculation and bracket management
3. **Progression.ts**: Team advancement between brackets
4. **TournamentStageSettings**: Configuration interface in `db/tables.ts`

## Implementation Plan

### Phase 1: Database Schema Updates

- [ ] #### 1.1 Extend TournamentStageSettings
**File**: `app/db/tables.ts`
- Add new optional properties to `TournamentStageSettings`:
  ```typescript
  // SWISS early advance/elimination settings
  earlyAdvanceEnabled?: boolean;
  advanceThreshold?: number;  // wins needed to advance (e.g., 3)
  eliminationThreshold?: number;  // losses needed to be eliminated (e.g., 3)
  ```

### Phase 2: Core Logic Implementation

- [ ] #### 2.1 Team Status Tracking
**File**: `app/features/tournament-bracket/core/Swiss.ts`
- Add new type for team status:
  ```typescript
  type SwissTeamStatus = "active" | "advanced" | "eliminated";
  ```

- [ ] #### 2.2 Status Calculation Function
- Implement function to determine team status based on win/loss record:
  ```typescript
  function calculateTeamStatus(
    wins: number,
    losses: number,
    settings: { advanceThreshold?: number; eliminationThreshold?: number }
  ): SwissTeamStatus
  ```

- [ ] #### 2.3 Update generateMatchUps Function
**File**: `app/features/tournament-bracket/core/Swiss.ts`
- Modify `generateMatchUps()` to:
  - Filter out teams that have advanced or been eliminated
  - Only create matches for teams with `ACTIVE` status
  - Handle uneven numbers of active teams with bye logic

### Phase 3: Standings and UI Updates

- [ ] #### 3.1 Enhanced Standings Display
**File**: `app/features/tournament-bracket/core/Bracket.ts`
- Modify `Standing` interface to include team status
- Update standings calculation to show:
  - Current win-loss record
  - Team status (Active/Advanced/Eliminated)
  - Remaining matches needed (if any)

- [ ] #### 3.2 Match Generation Logic
- Update the Swiss bracket to stop generating new rounds when:
  - All remaining active teams have played each other, OR
  - All teams have been classified (advanced/eliminated), OR
  - Maximum round limit is reached

### Phase 4: Tournament Configuration UI

- [ ] #### 4.1 Settings Form Updates
- Add new form fields for early advance/elimination settings:
  - Toggle to enable early advance/elimination
  - Input fields for advance and elimination thresholds
  - Validation to ensure thresholds make sense for the tournament size

### Phase 6: Testing and Validation

- [ ] #### 6.1 Unit Tests
**Files**: 
- `app/features/tournament-bracket/core/Swiss.test.ts`
- New test file for early advance/elimination logic

Test scenarios:
- Teams advancing early (3-0, 3-1)
- Teams eliminated early (0-3, 1-3)
- Mixed scenarios with different team counts
- Edge cases (uneven remaining teams, all teams classified early)

- [ ] #### 6.2 Integration Tests
- Test full tournament flow with early advance/elimination
- Verify standings calculations
- Test progression to next bracket stage

## Technical Considerations

### 1. Backward Compatibility
- All changes must be backward compatible with existing Swiss tournaments
- Default behavior (all rounds played) should remain unchanged when early advance/elimination is disabled

### 2. Match Fairness
- Ensure remaining active teams are paired fairly even when pool size is reduced
- Maintain Swiss pairing principles (similar records play each other)
- Handle bye distribution when active teams are odd-numbered

### 3. UI/UX Considerations
- Clear indication of team status in standings
- Progress indicators showing how close teams are to advancing/elimination
- Tournament organizer controls to override automatic classifications if needed

## Success Criteria

1. ✅ Teams stop playing once they reach win/loss thresholds
2. ✅ Tournament organizers can configure thresholds
3. ✅ Standings clearly show team status and progress
4. ✅ Match generation works correctly with reduced active team pools
5. ✅ Progression to next bracket stage works seamlessly
6. ✅ All existing Swiss tournaments continue to work unchanged
7. ✅ Performance remains acceptable for large tournaments
