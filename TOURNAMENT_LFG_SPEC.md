# Tournament LFG Feature Spec

## Overview

New `/to/:id/looking` route that provides SendouQ-style matchmaking for tournament team formation. Players and teams can find each other before tournament starts.

## Route

`/to/:id/looking` (new route, mirrors `/q/looking`)

## Data Model

Separate tables from SendouQ (cleaner separation):

### TournamentLFGGroup

| Column | Type | Description |
|--------|------|-------------|
| id | number | Primary key |
| tournamentTeamId | number | null | FK to TournamentTeam |
| visibility | string | JSON visibility info (/scrims style) |
| chatCode | string | Unique room code for group chat |
| createdAt | number | Timestamp |

### TournamentLFGGroupMember

| Column | Type | Description |
|--------|------|-------------|
| groupId | number | FK to TournamentLFGGroup |
| userId | number | FK to User |
| role | string | OWNER / MANAGER / REGULAR |
| note | string | Public note visible to group members |
| stayAsSub | boolean | Convert to sub if team not formed by start |
| createdAt | number | Timestamp |

### TournamentLFGLike

| Column | Type | Description |
|--------|------|-------------|
| likerGroupId | number | FK to TournamentLFGGroup |
| targetGroupId | number | FK to TournamentLFGGroup |
| createdAt | number | Timestamp |

### TournamentSub

Redundant, removed.

## Who Can Join

- **Solo players** - Looking for a team
- **Partial groups (2-3 players)** - Looking for more members
- **Already-registered tournament teams** - Recruiting up to `maxMembersPerTeam`

## Features

### Joining the Queue

- Players reuse weapon/VC data from `/q/settings` (`User.qWeaponPool`, `User.vc`, `User.languages`)
- Checkbox on join: "Add me as sub if I don't find a team"
- Support for notes (like SendouQ public member notes)
- Uses schema based SendouForm (forms.md for details)

### Visibility System (Scrims-style)

- **Base visibility**: team/org/public
- **Not-found visibility**: Time-delayed expansion if no match found
- Uses existing `AssociationVisibility` system from scrims

### Likes & Matching

1. Players/groups can like each other
2. Target group receives `TO_LFG_LIKED` notification
3. On mutual like, accepting party sees accept button
4. Accept click triggers:
   - If neither party is registered team → create a team (some default name is used)
   - If one party is registered team → Other party joins that team
   - If both parties are teams, the accepting team absorbs the liker team (accepting team's name is used for the new merged team)
5. After merge, combined group stays in queue to recruit more members

### Team Formation

- **Immediate registration**: When first two players merge, default name is used
- Newly formed team stays in LFG queue
- Teams can grow up to `maxMembersPerTeam` (typically 6 for 4v4)
- When `maxMembersPerTeam` is reached, team is automatically removed from the queue
- Solo players liking registered teams get absorbed as new members

### Tournament Start Auto-Cleanup

When tournament starts:
1. All unregistered LFG groups are deleted
2. Players who checked "stay as sub" are shown in a simple list "`TournamentLFGGroupMember` reused here even if they technically are no longer members of anything)
3. Their sub data uses existing `/q/settings` weapon/VC preferences

## Notifications

| Type | When | Meta |
|------|------|------|
| `TO_LFG_LIKED` | Someone likes your group | `{ tournamentId, tournamentName, likerUsername }` |
| `TO_LFG_TEAM_FORMED` | You join/form a team via LFG | `{ tournamentId, tournamentName, teamName, tournamentTeamId }` |
| `TO_LFG_CHAT_MESSAGE` | Chat message sent | `{ tournamentId, tournamentName, teamName, tournamentTeamId }` |

## UI

### Reuse from `/q/looking`

- `GroupCard` component (weapons, VC, tier display)
- Tab structure (My Group, Groups, Invitations)
- `MemberAdder` component (invite link, quick add), note for these same invite link and quick add endpoint is used as on /to/:id/register page
- `GroupLeaver` component
- Private user notes system

### Tab Structure

1. **My Group** - Current group members, invite link, leave button, chat (if 2+ members)
2. **Groups** - Other groups looking, with like/unlike buttons
3. **Invitations** - Groups that have liked your group, with accept/decline

### Accept Flow

Simple button click (SendouQ-style)

## Files to Create/Modify

### New Files

```
app/features/tournament-lfg/
├── core/
│   └── TournamentLFG.server.ts          # Main class (like SendouQ.server.ts)
├── routes/
│   ├── to.$id.looking.tsx               # Main LFG page
│   └── to.$id.looking.new.tsx           # Join LFG form (if needed)
├── loaders/
│   └── to.$id.looking.server.ts         # Data loader
├── actions/
│   └── to.$id.looking.server.ts         # Action handler
├── components/
│   └── (reuse from sendouq where possible)
├── TournamentLFGRepository.server.ts    # Database queries
├── tournament-lfg-types.ts              # TypeScript types
├── tournament-lfg-schemas.server.ts     # Zod validation
└── tournament-lfg-constants.ts          # Constants
```

### Migrations

```
migrations/XXX-tournament-lfg.js         # Create new tables
```

### Modified Files

- `app/routes.ts` - Add new route
- `app/features/notifications/notifications-types.ts` - Add new notification types
- `app/features/tournament-bracket/core/Tournament.ts` - Add LFG-related getters
- `app/features/tournament/components/TournamentTabs.tsx` - Add "Looking" tab

## Differences to SendouQ

- no invite code (tournament teams have their own invite code by default)
- no expiredAt

## Open Questions

- How we should define the autogenerated tournament team name?
