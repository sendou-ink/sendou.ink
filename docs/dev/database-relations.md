Note: some simple features omitted with only a few relations and no special notes

See `tables.ts` for some more documentation on column-level.

## Art

```mermaid
erDiagram
    Art ||--o{ ArtUserMetadata : has
    User ||--o{ ArtUserMetadata : has

    Art ||--o{ TaggedArt : tagged_with
    ArtTag ||--o{ TaggedArt : tags

    ArtTag ||--o{ User : created_by
    Art ||--o{ User : created_by
```

## Badges

```mermaid
erDiagram
    Badge ||--o{ BadgeManager : managed_by
    User ||--o{ BadgeManager : manages

    Badge ||--o{ TournamentBadgeOwner : owned_by
    User ||--o{ TournamentBadgeOwner : owns

    Badge }o--|| User : author
```

- **BadgeOwner** - Tournament badges with supporter badges included from user's supporter status

## Builds

```mermaid
erDiagram
    BuildAbility }|--|| Build : belongs_to
    BuildWeapon }|--|| Build : belongs_to

    Build }o--|| User : owned_by
```

## Calendar Events

```mermaid
erDiagram
    CalendarEvent ||--o{ CalendarEventBadge : has
    CalendarEventBadge }o--|| Badge : badge
    CalendarEvent ||--|{ CalendarEventDate : has
    CalendarEvent ||--o{ CalendarEventResultTeam : has
    CalendarEventResultTeam ||--o{ CalendarEventResultPlayer : has
    CalendarEvent }o--|| User : author
    CalendarEvent }o--o| Organization : organized_by
    CalendarEvent ||--o{ Tournament : related_to
```

### Notes

- "Calendar event result" concept is only for tournaments not hosted on sendou.ink
- Regular calendar event can have many dates, tournaments only one

## Groups (SendouQ)

```mermaid
erDiagram
    Group ||--o{ GroupMember : has
    User ||--o{ GroupMember : member_of

    Group ||--o{ GroupLike : likes
    Group ||--o{ GroupLike : liked_by

    Group ||--o| GroupMatch : alpha_in
    Group ||--o| GroupMatch : bravo_in
    User ||--o{ GroupMatch : reported_by

    GroupMatch ||--|{ GroupMatchMap : has
    Group ||--o| Team : team_id
```

### Notes

- Even if a group rejoins the queue with the same players after the match, a new "Group" is created in the DB

## LFG Posts

```mermaid
erDiagram
    LFGPost }o--|| User : author
    LFGPost }o--o| Team : team
```

## Map Pools

```mermaid
erDiagram
    MapPoolMap }o--|| CalendarEvent : calendar_event
    MapPoolMap }o--|| CalendarEvent : tie_breaker_calendar_event
    MapPoolMap }o--|| TournamentTeam : tournament_team
```

### Notes

Can be one of the following:
1) Regular calendar events map pool
2) Tournament's tiebreaker maps (teams' pick mode, AUTO_ALL)
3) Tournament's map pool (TO's map picking mode)
4) Tournament teams map picks (teams' pick mode, AUTO_ALL, AUTO_SZ etc.)

## Plus Server Suggestions

```mermaid
erDiagram
    PlusSuggestion }o--|| User : author
    PlusSuggestion }o--|| User : suggested
```

### Notes

- Comments to suggestions are also just suggestions same as new suggestions

## Plus Server Tiers

```mermaid
erDiagram
    PlusTier |o--|| User : userId
```

### Views
- **FreshPlusTier** - Calculates Plus Server Tiers based on the latest voting results

### Notes
- PlusTier is just FreshPlusTier materialized for performance reasons with players from the leaderboard added

## Results (maps/head-to-head)

```mermaid
erDiagram
    User ||--o{ MapResult : has
    PlayerResult }o--|| User : owner
    PlayerResult }o--|| User : other 
```

### Notes

- Denormalized tables to make fetching these efficient

## Scrims

```mermaid
erDiagram
    ScrimPost ||--|{ ScrimPostUser : has
    ScrimPost ||--o{ ScrimPostRequest : has
    ScrimPostRequest ||--|{ ScrimPostRequestUser : has

    User ||--o{ ScrimPostUser : participates
    User ||--o{ ScrimPostRequestUser : participates
```

## Teams

```mermaid
erDiagram
    AllTeam ||--o{ AllTeamMember : has
    User ||--o{ AllTeamMember : member_of
```

### Views

- **Team** - Teams excluding disbanded
- **TeamMember** - `AllTeamMember` excluding members who already left their team & secondary teams
- **TeamMemberWithSecondary** - `AllTeamMember` excluding members who already left their team but including secondary teams

## Tournaments

The database structure is mimicking the `brackets-manager.js` library. See this issue for a schema: [https://github.com/Drarig29/brackets-manager.js/issues/111#issuecomment-997417423](https://github.com/Drarig29/brackets-manager.js/issues/111#issuecomment-997417423)

## Tournament organizations

```mermaid
erDiagram
    TournamentOrganization ||--|{ TournamentOrganizationMember : has_member
    User ||--o{ TournamentOrganizationMember : member_of

    TournamentOrganization ||--o{ TournamentOrganizationBadge : has_badge
    Badge ||--o{ TournamentOrganizationBadge : badge_of

    TournamentOrganization ||--o{ TournamentOrganizationSeries : has_series
```

## Videos
```mermaid
erDiagram
    UnvalidatedVideo ||--|{ VideoMatch : has
    VideoMatch ||--o{ VideoMatchPlayer : has
```

### Notes

- `Video` - Same as `UnvalidatedVideo` (redundant)
