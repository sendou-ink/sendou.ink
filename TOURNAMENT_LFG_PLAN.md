# Tournament LFG Implementation Plan

## Overview

Add a new `/to/:id/looking` route that provides SendouQ-style matchmaking for tournament team formation. Players and teams can find each other before the tournament starts.

## Phase 1: Database Migration

**File**: `migrations/118-tournament-lfg.js`

Create three new tables:

### TournamentLFGGroup
| Column | Type | Notes |
|--------|------|-------|
| id | integer primary key | Auto-increment |
| tournamentId | integer not null | FK to Tournament |
| tournamentTeamId | integer | FK to TournamentTeam (null for unregistered groups) |
| visibility | text | JSON (AssociationVisibility) |
| chatCode | text not null | Unique room code for group chat |
| createdAt | integer | Default now |

### TournamentLFGGroupMember
| Column | Type | Notes |
|--------|------|-------|
| groupId | integer not null | FK to TournamentLFGGroup |
| userId | integer not null | FK to User |
| role | text not null | OWNER / MANAGER / REGULAR |
| note | text | Public note |
| isStayAsSub | integer | Boolean (0/1), default 0 |
| createdAt | integer | Default now |

### TournamentLFGLike
| Column | Type | Notes |
|--------|------|-------|
| likerGroupId | integer not null | FK to TournamentLFGGroup |
| targetGroupId | integer not null | FK to TournamentLFGGroup |
| createdAt | integer | Default now |

All tables use `STRICT` mode, `ON DELETE CASCADE` for FKs, and have indexes on FK columns.

---

## Phase 2: TypeScript Types

**File**: `app/db/tables.ts`

Add interfaces for the three new tables following existing patterns (`GeneratedAlways`, `Generated`, `JSONColumnTypeNullable`).

Add to the `DB` interface:
- `TournamentLFGGroup`
- `TournamentLFGGroupMember`
- `TournamentLFGLike`

---

## Phase 3: Feature File Structure

```
app/features/tournament-lfg/
├── TournamentLFGRepository.server.ts    # Database operations
├── tournament-lfg-types.ts              # TypeScript types (LFGGroup, LFGGroupMember, etc.)
├── tournament-lfg-schemas.server.ts     # Zod validation schemas
├── tournament-lfg-constants.ts          # Constants (note max length, etc.)
├── tournament-lfg-utils.ts              # Utility functions
├── routes/
│   └── to.$id.looking.tsx               # Main route (loader + action + component)
├── loaders/
│   └── to.$id.looking.server.ts         # Data loader
├── actions/
│   └── to.$id.looking.server.ts         # Action handler
└── components/
    └── LFGGroupCard.tsx                 # Group card (mirrors SendouQ GroupCard pattern)
```

---

## Phase 4: Repository Implementation

**File**: `app/features/tournament-lfg/TournamentLFGRepository.server.ts`

Mirror `SQGroupRepository.server.ts` pattern. Key functions:

**Group Management:**
- `findGroupsByTournamentId(tournamentId)` - Get all active groups
- `addMember(groupId, { userId, role, stayAsSub? })` - Add member to group
- `morphGroups({ survivingGroupId, otherGroupId })` - Merge two groups

**Likes:**
- `addLike({ likerGroupId, targetGroupId })` - Add like
- `deleteLike({ likerGroupId, targetGroupId })` - Remove like
- `allLikesByGroupId(groupId)` - Get { given: [], received: [] }

**Member Management:**
- `updateMemberNote({ groupId, userId, value })` - Update public note
- `updateMemberRole({ userId, groupId, role })` - Change role
- `updateStayAsSub({ groupId, userId, value })` - Toggle sub preference
- `kickMember({ groupId, userId })` - Owner kicks member

**Tournament Integration:**
- `cleanupForTournamentStart(tournamentId)` - Delete groups, preserve stayAsSub members
- `getSubsForTournament(tournamentId)` - Get users who opted to stay as sub

---

## Phase 5: Route Implementation

### 5.1 Route Registration

**File**: `app/routes.ts`

Add inside `/to/:id` children:
```typescript
route("looking", "features/tournament-lfg/routes/to.$id.looking.tsx"),
```

### 5.2 Loader

**File**: `app/features/tournament-lfg/loaders/to.$id.looking.server.ts`

Returns:
- `groups` - All visible groups (filtered by visibility)
- `ownGroup` - User's current group (if any)
- `likes` - { given: [], received: [] } for own group
- `privateNotes` - User's private notes on other players (reuse from SendouQ)
- `lastUpdated` - Timestamp for auto-refresh

### 5.3 Action

**File**: `app/features/tournament-lfg/actions/to.$id.looking.server.ts`

Actions:
- `JOIN_QUEUE` - Create new group
- `LIKE` / `UNLIKE` - Like/unlike another group
- `ACCEPT` - Accept mutual like (triggers team creation/merge)
- `LEAVE_GROUP` - Leave current group
- `KICK_FROM_GROUP` - Owner kicks member
- `GIVE_MANAGER` / `REMOVE_MANAGER` - Role management
- `UPDATE_NOTE` - Update public note
- `UPDATE_STAY_AS_SUB` - Toggle sub preference
- `REFRESH_GROUP` - Refresh activity timestamp

**ACCEPT Action Flow:**
1. Verify mutual like exists
2. Check if either group has `tournamentTeamId`
3. If neither: Create new `TournamentTeam` (use auto-generated name)
4. Merge groups (use `morphGroups`)
5. Add all members to `TournamentTeamMember`
6. Send `TO_LFG_TEAM_FORMED` notification
7. If team reaches `maxMembersPerTeam`: delete the LFG group

### 5.4 Component

**File**: `app/features/tournament-lfg/routes/to.$id.looking.tsx`

Structure (mirror `/q/looking`):
- Three-column desktop layout: My Group | Groups | Invitations
- Tab structure on mobile
- Reuse `GroupCard` display pattern (weapons, VC, tier)
- Reuse `MemberAdder` for quick-add trusted players
- Reuse `GroupLeaver` component
- Chat integration for groups with 2+ members
- "Stay as sub" checkbox in join form

---

## Phase 6: Tournament Integration

### 6.1 Add "Looking" Tab

**File**: `app/features/tournament/routes/to.$id.tsx`

Add new `SubNavLink` (show only before tournament starts, not for invitationals):
```tsx
{!tournament.hasStarted && !tournament.isInvitational && (
  <SubNavLink to="looking">{t("tournament:tabs.looking")}</SubNavLink>
)}
```

### 6.2 Tournament.ts Getter

**File**: `app/features/tournament-bracket/core/Tournament.ts`

Add:
```typescript
get lfgEnabled() {
  return !this.isInvitational && !this.hasStarted && this.subsFeatureEnabled;
}
```

### 6.3 Auto-cleanup on Tournament Start

When tournament bracket starts, call `TournamentLFGRepository.cleanupForTournamentStart(tournamentId)`:
- Delete all `TournamentLFGGroup` records
- Preserve `TournamentLFGGroupMember` records where `stayAsSub = 1` for subs list

---

## Phase 7: Notifications

**File**: `app/features/notifications/notifications-types.ts`

Add three new notification types:

```typescript
| NotificationItem<
    "TO_LFG_LIKED",
    {
      tournamentId: number;
      tournamentName: string;
      likerUsername: string;
    }
  >
| NotificationItem<
    "TO_LFG_TEAM_FORMED",
    {
      tournamentId: number;
      tournamentName: string;
      teamName: string;
      tournamentTeamId: number;
    }
  >
| NotificationItem<
    "TO_LFG_CHAT_MESSAGE",
    {
      tournamentId: number;
      tournamentName: string;
      teamName: string;
      tournamentTeamId: number;
    }
  >
```

**File**: `app/features/notifications/notifications-utils.ts`

Add notification link handlers and icon mappings.

---

## Phase 8: Translations

**File**: `public/locales/en/tournament.json`

Add keys:
- `tabs.looking`
- `lfg.join.header`, `lfg.join.stayAsSub`, `lfg.join.visibility`
- `lfg.myGroup.header`, `lfg.myGroup.empty`
- `lfg.groups.header`, `lfg.groups.empty`
- `lfg.invitations.header`, `lfg.invitations.empty`, `lfg.invitations.accept`
- `lfg.actions.like`, `lfg.actions.unlike`, `lfg.actions.leave`

Run `npm run i18n:sync` after adding.

---

## Phase 9: Group Merging Logic

When two groups merge via ACCEPT:

| Group A has team | Group B has team | Result |
|------------------|------------------|--------|
| No | No | Create new TournamentTeam, both join it |
| Yes | No | B's members join A's team |
| No | Yes | A's members join B's team |
| Yes | Yes | Accepting team absorbs liker team (accepting team name persists) |

Auto-generated team name format: `"<owner_username>'s Team"` (e.g., "Sendou's Team" - can be changed later on registration page)

After merge:
- Combined group stays in LFG queue
- When `maxMembersPerTeam` reached, group is auto-removed from queue

---

## Key Files to Reference

| Purpose | File |
|---------|------|
| Repository pattern | `app/features/sendouq/SQGroupRepository.server.ts` |
| Route pattern | `app/features/sendouq/routes/q.looking.tsx` |
| Action pattern | `app/features/sendouq/actions/q.looking.server.ts` |
| GroupCard UI | `app/features/sendouq/components/GroupCard.tsx` |
| Tournament tabs | `app/features/tournament/routes/to.$id.tsx` |
| Team creation | `app/features/tournament/TournamentTeamRepository.server.ts` |
| Notification types | `app/features/notifications/notifications-types.ts` |
| Visibility type | `app/features/associations/associations-types.ts` |

---

## Implementation Order

1. Migration (100-tournament-lfg.js)
2. Types (tables.ts + tournament-lfg-types.ts)
3. Repository (TournamentLFGRepository.server.ts)
4. Schemas (tournament-lfg-schemas.server.ts)
5. Loader (to.$id.looking.server.ts)
6. Action (to.$id.looking.server.ts)
7. Route component (to.$id.looking.tsx)
8. Tournament integration (tab, cleanup hook)
9. Notifications (types + utils)
10. Translations
11. Testing

---

## Verification

1. **Manual Testing:**
   - Join LFG as solo player
   - Create group with 2 players
   - Like another group, verify notification sent
   - Accept mutual like, verify team created
   - Verify team appears on registration page
   - Test "stay as sub" checkbox
   - Test visibility filtering

2. **Unit Tests:**
   - Repository functions (create, merge, delete, likes)
   - Visibility filtering logic

3. **E2E Tests:**
   - Full flow: join -> like -> accept -> team formed
   - Leave group
   - Kick from group

4. **Run checks:**
   ```bash
   npm run checks
   ```
