CREATE TABLE IF NOT EXISTS "User" (
    "id" integer primary key,
    "discordId" text unique not null,
    "discordName" text not null,
    "discordAvatar" text,
    "twitch" text,
    "youtubeId" text,
    "bio" text,
    "country" text
  , "patronTier" integer, "patronSince" integer, "customUrl" text, "stickSens" integer, "motionSens" integer, "inGameName" text, "css" text, "patronTill" integer, "isVideoAdder" integer default 0, "discordUniqueName" text, "showDiscordUniqueName" integer not null default 1, "commissionsOpen" integer default 0, "isArtist" integer default 0, "commissionText" text, "banned" integer default 0, "vc" text default "NO", "languages" text, "plusSkippedForSeasonNth" integer, "mapModePreferences" text, "qWeaponPool" text, "noScreen" integer default 0, "bannedReason" text, "customName" text, "username" text generated always as (coalesce("customName", "discordName")) virtual, "battlefy" text, "buildSorting" text, "isTournamentOrganizer" integer default 0, "bsky" text, "preferences" text, "favoriteBadgeIds" text, "createdAt" integer) strict
  ;
CREATE TABLE IF NOT EXISTS "PlusSuggestion" (
    "id" integer primary key,
    "text" text not null,
    "authorId" integer not null,
    "suggestedId" integer not null,
    "month" integer not null,
    "year" integer not null,
    "tier" integer not null,
    "createdAt" integer default (strftime('%s', 'now')) not null,
    foreign key ("authorId") references "User"("id") on delete cascade,
    foreign key ("suggestedId") REFERENCES "User"("id") ON delete cascade,
    unique(
      "month",
      "year",
      "suggestedId",
      "authorId",
      "tier"
    ) on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "PlusVote" (
    "month" integer not null,
    "year" integer not null,
    "tier" integer not null,
    "authorId" integer not null,
    "votedId" integer not null,
    "score" integer not null,
    "validAfter" integer not null,
    foreign key ("authorId") references "User"("id") on delete cascade,
    foreign key ("votedId") references "User"("id") on delete cascade,
    unique("month", "year", "authorId", "votedId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "Badge" (
      "id" integer primary key,
      "code" text not null,
      "displayName" text not null
    , "hue" integer, "authorId" integer) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentBadgeOwner" (
      "badgeId" integer not null,
      "userId" integer not null
    , "tournamentId" integer) strict
  ;
CREATE TABLE IF NOT EXISTS "BadgeManager" (
      "badgeId" integer not null,
      "userId" integer not null,
      unique("badgeId", "userId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "CalendarEvent" (
      "id" integer primary key,
      "name" text not null,
      "authorId" integer not null,
      "bracketUrl" text not null,
      "description" text,
      "discordInviteCode" text,
      "discordUrl" text generated always as ('https://discord.gg/' || "discordInviteCode") virtual,
      "participantCount" integer,
      "tags" text, "tournamentId" integer, "avatarImgId" integer, "organizationId" integer references "TournamentOrganization"("id") on delete set null, "hidden" integer default 0,
      foreign key ("authorId") references "User"("id") on delete restrict
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "CalendarEventDate" (
      "id" integer primary key,
      "eventId" integer not null,
      "startTime" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "CalendarEventResultTeam" (
      "id" integer primary key,
      "eventId" integer not null,
      "name" text not null,
      "placement" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "CalendarEventResultPlayer" (
      "teamId" integer not null,
      "userId" integer,
      "name" text,
      foreign key ("teamId") references "CalendarEventResultTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete restrict
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "CalendarEventBadge" (
      "eventId" integer not null,
      "badgeId" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade,
      foreign key ("badgeId") references "Badge"("id") on delete restrict,
      unique("eventId", "badgeId") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "Build" (
      "id" integer primary key,
      "ownerId" integer not null,
      "title" text not null,
      "description" text,
      "modes" text,
      "headGearSplId" integer not null,
      "clothesGearSplId" integer not null,
      "shoesGearSplId" integer not null,
      "updatedAt" integer default (strftime('%s', 'now')) not null, "private" integer default 0,
      foreign key ("ownerId") references "User"("id") on delete restrict
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "BuildWeapon" (
      "buildId" integer not null,
      "weaponSplId" integer not null,
      foreign key ("buildId") references "Build"("id") on delete cascade,
      unique("buildId", "weaponSplId") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "BuildAbility" (
      "buildId" integer not null,
      "gearType" text not null,
      "ability" text not null,
      "slotIndex" integer not null, "abilityPoints" integer generated always as (case when "slotIndex" = 0 then 10 else 3 end) virtual,
      foreign key ("buildId") references "Build"("id") on delete cascade,
      unique("buildId", "gearType", "slotIndex") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "MapPoolMap" (
      "calendarEventId" integer,
      "stageId" integer not null,
      "mode" text not null, "tournamentTeamId" integer, "tieBreakerCalendarEventId" integer,
      foreign key ("calendarEventId") references "CalendarEvent"("id") on delete cascade,
      unique("calendarEventId", "stageId", "mode") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "UserResultHighlight" (
      "teamId" integer not null,
      "userId" integer not null,
      foreign key ("teamId") references "CalendarEventResultTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("teamId", "userId") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "UserWeapon" (
    "userId" integer not null,
    "weaponSplId" integer not null,
    "order" integer not null,
    "createdAt" integer default (strftime('%s', 'now')) not null, "isFavorite" integer not null default 0,
    unique("userId", "weaponSplId") on conflict rollback,
    unique("userId", "order") on conflict rollback,
    foreign key ("userId") references "User"("id") on delete restrict
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "AllTeam" (
      "id" integer primary key,
      "name" text not null,
      "customUrl" text not null,
      "inviteCode" text not null,
      "bio" text,
      "avatarImgId" integer,
      "bannerImgId" integer,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "deletedAt" integer, "css" text, "bsky" text,
      foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null,
      foreign key ("bannerImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "AllTeamMember" (
      "teamId" integer not null,
      "userId" integer not null,
      "role" text,
      "isOwner" integer not null default 0,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "leftAt" integer, "isMainTeam" integer default 1, "isManager" integer default 0,
      foreign key ("teamId") references "AllTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("teamId", "userId") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "UnvalidatedUserSubmittedImage" (
      "id" integer primary key,
      "validatedAt" integer,
      "url" text not null unique,
      "submitterUserId" integer not null,
      foreign key ("submitterUserId") references "User"("id") on delete set null
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "PlusTier" (
      "userId" integer primary key,
      "tier" integer not null,
      foreign key ("userId") references "User"("id") on delete set null
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "UnvalidatedVideo" (
    "id" integer primary key,
    "title" text not null,
    "type" text not null,
    "youtubeId" text not null,
    "youtubeDate" integer not null,
    "submitterUserId" integer not null,
    "validatedAt" integer,
    "eventId" integer,
    foreign key ("submitterUserId") references "User"("id") on delete restrict,
    foreign key ("eventId") references "CalendarEvent"("id") on delete restrict
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "VideoMatch" (
      "id" integer primary key,
      "videoId" integer not null,
      "startsAt" integer not null,
      "stageId" integer not null,
      "mode" text not null,
      foreign key ("videoId") references "UnvalidatedVideo"("id") on delete cascade
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "VideoMatchPlayer" (
      "videoMatchId" integer not null,
      "playerUserId" integer,
      "playerName" text,
      "weaponSplId" integer not null,
      "player" integer not null,
      foreign key ("videoMatchId") references "VideoMatch"("id") on delete cascade,
      foreign key ("playerUserId") references "User"("id") on delete restrict
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "XRankPlacement" (
    "id" integer primary key,
    "weaponSplId" integer not null,
    "name" text not null,
    "nameDiscriminator" text not null,
    "power" real not null,
    "rank" integer not null,
    "title" text not null,
    "badges" text not null,
    "bannerSplId" integer not null,
    "playerId" integer not null,
    "month" integer not null,
    "year" integer not null,
    "mode" text not null,
    "region" text not null,
    foreign key ("playerId") references "SplatoonPlayer"("id") on delete cascade,
    unique("rank", "month", "year", "region", "mode") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "SplatoonPlayer" (
    "id" integer primary key,
    "userId" integer unique,
    "splId" text unique not null,
    foreign key ("userId") references "User"("id") on delete cascade
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "Tournament" (
    "id" integer primary key,
    "mapPickingStyle" text not null,
    "castTwitchAccounts" text, "settings" text not null default '{"bracketProgression":[{"type":"double_elimination","name":"Main bracket"}]}', "castedMatchesInfo" text, "rules" text, "preparedMaps" text, "parentTournamentId" integer references "Tournament"("id") on delete restrict, "isFinalized" integer not null default 0) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentTeam" (
      "id" integer primary key,
      "name" text not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "seed" integer,
      "inviteCode" text not null unique,
      "tournamentId" integer not null,
      "prefersNotToHost" integer not null default 0, "noScreen" integer not null default 0, "teamId" integer, "droppedOut" integer default 0, "activeRosterUserIds" text, "avatarImgId" integer, "startingBracketIdx" integer,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      unique("tournamentId", "name") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentTeamCheckIn" (
      "tournamentTeamId" integer not null,
      "checkedInAt" integer not null, "bracketIdx" integer, "isCheckOut" integer default 0,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentTeamMember" (
      "tournamentTeamId" integer not null,
      "userId" integer not null,
      "isOwner" integer not null default 0,
      "createdAt" integer default (strftime('%s', 'now')) not null, "inGameName" text,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      unique("tournamentTeamId", "userId") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentStage" (
    "id" integer primary key,
    "tournamentId" integer not null,
    "name" text not null,
    "type" text not null,
    "settings" text not null,
    "number" integer not null, "createdAt" integer,
    foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
    unique("number", "tournamentId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentGroup" (
    "id" integer primary key,
    "stageId" integer not null,
    "number" integer not null,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    unique("number", "stageId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentRound" (
    "id" integer primary key,
    "stageId" integer not null,
    "groupId" integer not null,
    "number" integer not null, "maps" text,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    foreign key ("groupId") references "TournamentGroup"("id") on delete cascade,
    unique("number", "groupId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentMatch" (
    "id" integer primary key,
    "roundId" integer not null,
    "stageId" integer not null,
    "groupId" integer not null,
    "number" integer not null,
    "opponentOne" text not null,
    "opponentTwo" text not null,
    "status" integer not null, "chatCode" text, "createdAt" integer,
    foreign key ("roundId") references "TournamentRound"("id") on delete cascade,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    foreign key ("groupId") references "TournamentGroup"("id") on delete cascade,
    unique("number", "roundId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentMatchGameResult" (
      "id" integer primary key,
      "matchId" integer not null,
      "number" integer not null,
      "stageId" integer not null,
      "mode" text not null,
      "source" text not null,
      "winnerTeamId" integer not null,
      "reporterId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null, "opponentOnePoints" integer, "opponentTwoPoints" integer,
      foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
      foreign key ("winnerTeamId") references "TournamentTeam"("id") on delete restrict,
      foreign key ("reporterId") references "User"("id") on delete restrict,
      unique("matchId", "number") on conflict rollback
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentMatchGameResultParticipant" (
    "matchGameResultId" integer not null,
    "userId" integer not null, "tournamentTeamId" integer,
    foreign key ("matchGameResultId") references "TournamentMatchGameResult"("id") on delete cascade,
    foreign key ("userId") references "User"("id") on delete cascade,
    unique("matchGameResultId", "userId") on conflict rollback
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TrustRelationship" (
    "trustGiverUserId" integer not null,
    "trustReceiverUserId" integer not null, "lastUsedAt" integer default 0,
    foreign key ("trustGiverUserId") references "User"("id") on delete cascade,
    foreign key ("trustReceiverUserId") references "User"("id") on delete cascade,
    unique("trustGiverUserId", "trustReceiverUserId") on conflict ignore
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentSub" (
      "userId" integer not null,
      "tournamentId" integer not null,
      "canVc" integer not null,
      "bestWeapons" text not null,
      "okWeapons" text,
      "message" text,
      "visibility" text not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      unique("userId", "tournamentId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "Skill" (
      "id" integer primary key,
      "mu" real not null,
      "sigma" real not null,
      "ordinal" real not null,
      "userId" integer,
      "identifier" text,
      "matchesCount" integer not null,
      "tournamentId" integer, "groupMatchId" integer, "season" integer not null, "createdAt" integer,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete restrict,
      unique("userId", "tournamentId") on conflict rollback 
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "SkillTeamUser" (
      "userId" integer not null,
      "skillId" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("skillId") references "Skill"("id") on delete cascade,
      unique("userId", "skillId") on conflict rollback 
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "TournamentResult" (
      "tournamentId" integer not null,
      "userId" integer not null,
      "placement" integer not null,
      "isHighlight" integer not null default 0,
      "participantCount" integer not null,
      "tournamentTeamId" integer not null, "setResults" text not null default '[]', "spDiff" real,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      unique("userId", "tournamentId") on conflict rollback 
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "Art" (
      "id" integer primary key,
      "imgId" integer not null,
      "authorId" integer not null,
      "isShowcase" integer not null default 0,
      "description" text,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("authorId") references "User"("id") on delete restrict,
      foreign key ("imgId") references "UnvalidatedUserSubmittedImage"("id") on delete restrict
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "ArtUserMetadata" (
      "artId" integer not null,
      "userId" integer not null,
      foreign key ("artId") references "Art"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "ArtTag" (
      "id" integer primary key,
      "name" text unique not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "authorId" integer not null,
      foreign key ("authorId") references "User"("id") on delete restrict
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "TaggedArt" (
      "artId" integer not null,
      "tagId" integer not null,
      foreign key ("artId") references "Art"("id") on delete cascade,
      foreign key ("tagId") references "ArtTag"("id") on delete cascade
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "MapResult" (
      "mode" text not null,
      "stageId" integer not null,
      "userId" integer not null,
      "wins" integer not null,
      "losses" integer not null,
      "season" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("userId", "stageId", "mode", "season") on conflict rollback 
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "PlayerResult" (
      "ownerUserId" integer not null,
      "otherUserId" integer not null,
      "mapWins" integer not null,
      "mapLosses" integer not null,
      "setWins" integer not null,
      "setLosses" integer not null,
      "type" text not null,
      "season" integer not null,
      foreign key ("ownerUserId") references "User"("id") on delete cascade,
      foreign key ("otherUserId") references "User"("id") on delete cascade,
      unique("ownerUserId", "otherUserId", "type", "season") on conflict rollback 
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "Group" (
      "id" integer primary key,
      "teamId" integer,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "latestActionAt" integer default (strftime('%s', 'now')) not null,
      "inviteCode" text not null,
      "status" text not null, "chatCode" text,
      foreign key ("teamId") references "AllTeam"("id") on delete restrict
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "GroupMember" (
      "groupId" integer not null,
      "userId" integer not null,
      "role" text not null,
      "createdAt" integer default (strftime('%s', 'now')) not null, "note" text,
      foreign key ("userId") references "User"("id") on delete restrict,
      foreign key ("groupId") references "Group"("id") on delete cascade,
      unique("userId", "groupId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "GroupLike" (
      "likerGroupId" integer not null,
      "targetGroupId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null, "isRechallenge" integer,
      foreign key ("likerGroupId") references "Group"("id") on delete cascade,
      foreign key ("targetGroupId") references "Group"("id") on delete cascade,
      unique("likerGroupId", "targetGroupId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "GroupMatch" (
      "id" integer primary key,
      "alphaGroupId" integer not null,
      "bravoGroupId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "reportedAt" integer,
      "reportedByUserId" integer, "chatCode" text, "memento" text,
      foreign key ("alphaGroupId") references "Group"("id") on delete restrict,
      foreign key ("bravoGroupId") references "Group"("id") on delete restrict,
      foreign key ("reportedByUserId") references "User"("id") on delete restrict,
      unique("alphaGroupId") on conflict rollback,
      unique("bravoGroupId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "GroupMatchMap" (
      "id" integer primary key,
      "matchId" integer not null,
      "index" integer not null,
      "mode" text not null,
      "stageId" integer not null,
      "source" text not null,
      "winnerGroupId" integer,
      foreign key ("matchId") references "GroupMatch"("id") on delete cascade,
      foreign key ("winnerGroupId") references "Group"("id") on delete restrict,
      unique("matchId", "index") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "ReportedWeapon" (
      "groupMatchMapId" integer,
      "weaponSplId" integer not null,
      "userId" integer not null,
      foreign key ("groupMatchMapId") references "GroupMatchMap"("id") on delete restrict,
      foreign key ("userId") references "User"("id") on delete restrict,
      unique("groupMatchMapId", "userId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "LogInLink" (
      "code" text unique not null,
      "expiresAt" integer not null,
      "userId" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "PrivateUserNote" (
        "authorId" integer not null,
        "targetId" integer not null,
        "text" text,
        "sentiment" text not null,
        "updatedAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete cascade,
        foreign key ("targetId") references "User"("id") on delete cascade,
        unique("authorId", "targetId") on conflict rollback
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentStaff" (
      "tournamentId" integer not null,
      "userId" integer not null,
      "role" text not null,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("tournamentId", "userId") on conflict rollback
    ) strict
  ;
CREATE TABLE IF NOT EXISTS "UserFriendCode" (
        "friendCode" text not null,
        "userId" integer not null,
        "submitterUserId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("submitterUserId") references "User"("id") on delete cascade
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentMatchPickBanEvent" (
        "type" text not null,
        "stageId" integer not null,
        "mode" text not null,
        "matchId" integer not null,
        "authorId" integer not null,
        "number" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete restrict,
        foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
        unique("matchId", "number") on conflict rollback
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "LFGPost" (
        "id" integer primary key,
        "type" text not null,
        "text" text not null,
        "timezone" text not null,
        "authorId" integer not null,
        "teamId" integer,
        "plusTierVisibility" integer,
        "updatedAt" integer default (strftime('%s', 'now')) not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete restrict,
        foreign key ("teamId") references "AllTeam"("id") on delete cascade,
        unique("authorId", "type") on conflict rollback
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentOrganization" (
        "id" integer primary key,
        "name" text not null,
        "slug" text unique not null,
        "description" text,
        "socials" text,
        "avatarImgId" integer,
        foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentOrganizationMember" (
        "organizationId" integer not null,
        "userId" integer not null,
        "role" text not null,
        "roleDisplayName" text,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade,
        foreign key ("userId") references "User"("id") on delete cascade,
				unique("organizationId", "userId") on conflict rollback
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentOrganizationBadge" (
        "organizationId" integer not null,
        "badgeId" integer not null,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade,
        foreign key ("badgeId") references "Badge"("id") on delete cascade,
				unique("organizationId", "badgeId") on conflict rollback
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentOrganizationSeries" (
				"id" integer primary key,
        "organizationId" integer not null,
        "name" text not null,
				"description" text,
        "substringMatches" text not null,
				"showLeaderboard" integer not null default 0,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade
      ) strict
    ;
CREATE TABLE IF NOT EXISTS "SeedingSkill" (
      "mu" real not null,
      "sigma" real not null,
      "ordinal" real not null,
      "userId" integer not null,
      "type" text not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("userId", "type") on conflict replace 
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "TournamentBracketProgressionOverride" (
      "sourceBracketIdx" integer not null,
      "destinationBracketIdx" integer not null,
      "tournamentTeamId" integer not null,
      "tournamentId" integer not null,
      unique("sourceBracketIdx", "tournamentTeamId") on conflict replace,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade
    ) strict
    ;
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" integer primary key,
    "type" text not null,
    "meta" text,
    "pictureUrl" text,
    "createdAt" integer default (strftime('%s', 'now')) not null
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "NotificationUser" (
    "notificationId" integer not null,
    "userId" integer not null,
    "seen" integer default 0 not null,
    unique("notificationId", "userId"),
    foreign key ("notificationId") references "Notification"("id") on delete cascade,
    foreign key ("userId") references "User"("id") on delete cascade
  ) strict
  ;
CREATE TABLE IF NOT EXISTS "NotificationUserSubscription" (
      "id" integer primary key,
      "userId" integer not null,
      "subscription" text not null,
      foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      ;
CREATE TABLE IF NOT EXISTS "ScrimPost" (
      "id" integer primary key,
      "at" integer not null,
      "maxDiv" integer,
      "minDiv" integer,
      "visibility" text,
      "text" text,
      "chatCode" text not null,
      "teamId" integer,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "updatedAt" integer default (strftime('%s', 'now')) not null, "managedByAnyone" integer default 0 not null, "canceledAt" integer, "canceledByUserId" integer references "User"("id") on delete restrict, "cancelReason" text, "isScheduledForFuture" integer default 1,
      foreign key ("teamId") references "AllTeam"("id") on delete cascade
      ) strict
;
CREATE TABLE IF NOT EXISTS "ScrimPostUser" (
  "scrimPostId" integer not null,
  "userId" integer not null,
  "isOwner" integer not null,
  unique("scrimPostId", "userId") on conflict rollback,
  foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
  foreign key ("userId") references "User"("id") on delete cascade
  ) strict
;
CREATE TABLE IF NOT EXISTS "ScrimPostRequest" (
  "id" integer primary key,
  "scrimPostId" integer not null,
  "teamId" integer,
  "isAccepted" integer default 0 not null,
  "createdAt" integer default (strftime('%s', 'now')) not null,
  unique("scrimPostId", "teamId") on conflict rollback,
  foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
  foreign key ("teamId") references "AllTeam"("id") on delete cascade
  ) strict
;
CREATE TABLE IF NOT EXISTS "ScrimPostRequestUser" (
  "scrimPostRequestId" integer not null,
  "userId" integer not null,
  "isOwner" integer not null,
  unique("scrimPostRequestId", "userId") on conflict rollback,
  foreign key ("scrimPostRequestId") references "ScrimPostRequest"("id") on delete cascade,
  foreign key ("userId") references "User"("id") on delete cascade
  ) strict
;
CREATE TABLE IF NOT EXISTS "Association" (
    "id" integer primary key,
    "name" text not null,
    "inviteCode" text not null unique,
    "createdAt" integer default (strftime('%s', 'now')) not null
    ) strict
;
CREATE TABLE IF NOT EXISTS "AssociationMember" (
    "userId" integer not null,
    "associationId" integer not null,
    "role" text not null,
    unique("userId", "associationId") on conflict rollback,
    foreign key ("userId") references "User"("id") on delete cascade,
    foreign key ("associationId") references "Association"("id") on delete cascade
    ) strict
;
CREATE INDEX plus_suggestion_author_id on "PlusSuggestion"("authorId");
CREATE INDEX plus_suggestion_suggested_id on "PlusSuggestion"("suggestedId");
CREATE INDEX plus_vote_author_id on "PlusVote"("authorId");
CREATE INDEX plus_vote_voted_id on "PlusVote"("votedId");
CREATE INDEX build_owner_id on "Build"("ownerId");
CREATE INDEX build_weapon_build_id on "BuildWeapon"("buildId");
CREATE INDEX build_ability_build_id on "BuildAbility"("buildId");
CREATE UNIQUE INDEX user_custom_url_unique on "User"("customUrl");
CREATE INDEX map_pool_map_calendar_event_id on "MapPoolMap"("calendarEventId");
CREATE INDEX user_result_highlight_user_id on "UserResultHighlight"("userId");
CREATE INDEX user_result_highlight_team_id on "UserResultHighlight"("teamId");
CREATE INDEX map_pool_map_tournament_team_id on "MapPoolMap"("tournamentTeamId");
CREATE INDEX map_pool_map_tie_breaker_calendar_event_id on "MapPoolMap"("tieBreakerCalendarEventId");
CREATE INDEX user_weapon_user_id on "UserWeapon"("userId");
CREATE INDEX team_custom_url on "AllTeam"("customUrl");
CREATE INDEX submitter_user_id on "UnvalidatedUserSubmittedImage"("submitterUserId");
CREATE INDEX video_event_id on "UnvalidatedVideo"("eventId");
CREATE INDEX video_match_video_id on "VideoMatch"("videoId");
CREATE INDEX video_match_player_video_match_id on "VideoMatchPlayer"("videoMatchId");
CREATE INDEX video_match_player_player_user_id on "VideoMatchPlayer"("playerUserId");
CREATE INDEX splatoon_placement_player_id on "XRankPlacement"("playerId");
CREATE INDEX splatoon_player_user_id on "SplatoonPlayer"("userId");
CREATE INDEX calendar_event_tournament_id on "CalendarEvent"("tournamentId");
CREATE INDEX tournament_team_tournament_id on "TournamentTeam"("tournamentId");
CREATE INDEX tournament_team_check_in_tournament_team_id on "TournamentTeamCheckIn"("tournamentTeamId");
CREATE INDEX tournament_team_member_tournament_team_id on "TournamentTeamMember"("tournamentTeamId");
CREATE INDEX tournament_stage_tournament_id on "TournamentStage"("tournamentId");
CREATE INDEX tournament_group_stage_id on "TournamentGroup"("stageId");
CREATE INDEX tournament_round_stage_id on "TournamentRound"("stageId");
CREATE INDEX tournament_round_group_id on "TournamentRound"("groupId");
CREATE INDEX tournament_match_round_id on "TournamentMatch"("roundId");
CREATE INDEX tournament_match_stage_id on "TournamentMatch"("stageId");
CREATE INDEX tournament_match_group_id on "TournamentMatch"("groupId");
CREATE INDEX tournament_match_game_result_match_id on "TournamentMatchGameResult"("matchId");
CREATE INDEX tournament_match_game_result_winner_team_id on "TournamentMatchGameResult"("winnerTeamId");
CREATE INDEX tournament_match_game_result_participant_match_game_result_id on "TournamentMatchGameResultParticipant"("matchGameResultId");
CREATE INDEX tournament_match_game_result_participant_user_id on "TournamentMatchGameResultParticipant"("userId");
CREATE INDEX trust_relationship_trust_giver_user_id on "TrustRelationship"("trustGiverUserId");
CREATE INDEX trust_relationship_trust_receiver_user_id on "TrustRelationship"("trustReceiverUserId");
CREATE INDEX tournament_sub_user_id on "TournamentSub"("userId");
CREATE INDEX tournament_sub_tournament_id on "TournamentSub"("tournamentId");
CREATE INDEX skill_user_id on "Skill"("userId");
CREATE INDEX skill_tournament_id on "Skill"("tournamentId");
CREATE INDEX skill_team_user_user_id on "SkillTeamUser"("userId");
CREATE INDEX skill_team_user_skill_id on "SkillTeamUser"("skillId");
CREATE INDEX tournament_result_user_id on "TournamentResult"("userId");
CREATE INDEX tournament_result_tournament_id on "TournamentResult"("tournamentId");
CREATE INDEX art_author_id on "Art"("authorId");
CREATE INDEX art_img_id on "Art"("imgId");
CREATE INDEX art_user_metadata_art_id on "ArtUserMetadata"("artId");
CREATE INDEX art_user_metadata_user_id on "ArtUserMetadata"("userId");
CREATE INDEX tagged_art_art_id on "TaggedArt"("artId");
CREATE INDEX tagged_art_tag_id on "TaggedArt"("tagId");
CREATE INDEX skill_identifier on "Skill"("identifier");
CREATE INDEX skill_group_match_id on "Skill"("groupMatchId");
CREATE INDEX map_result_user_id on "MapResult"("userId");
CREATE INDEX player_result_owner_user_id on "PlayerResult"("ownerUserId");
CREATE INDEX player_result_other_user_id on "PlayerResult"("otherUserId");
CREATE INDEX group_team_id on "Group"("teamId");
CREATE INDEX group_member_group_id on "GroupMember"("groupId");
CREATE INDEX group_member_user_id on "GroupMember"("userId");
CREATE INDEX group_like_liker_group_id on "GroupLike"("likerGroupId");
CREATE INDEX group_like_target_group_id on "GroupLike"("targetGroupId");
CREATE INDEX group_match_alpha_group_id on "GroupMatch"("alphaGroupId");
CREATE INDEX group_match_bravo_group_id on "GroupMatch"("bravoGroupId");
CREATE INDEX group_match_reported_by_user_id on "GroupMatch"("reportedByUserId");
CREATE INDEX group_match_map_match_id on "GroupMatchMap"("matchId");
CREATE INDEX group_match_map_winner_group_id on "GroupMatchMap"("winnerGroupId");
CREATE INDEX reported_weapon_group_match_map_id on "ReportedWeapon"("groupMatchMapId");
CREATE INDEX reported_weapon_user_id on "ReportedWeapon"("userId");
CREATE INDEX user_patron_tier on "User"("patronTier");
CREATE INDEX calendar_event_result_player_user_id on "CalendarEventResultPlayer"("userId");
CREATE INDEX calendar_event_result_player_team_id on "CalendarEventResultPlayer"("teamId");
CREATE INDEX pick_ban_event_author_id on "TournamentMatchPickBanEvent"("authorId");
CREATE INDEX pick_ban_event_match_id on "TournamentMatchPickBanEvent"("matchId");
CREATE INDEX group_match_created_at on "GroupMatch"("createdAt");
CREATE INDEX skill_season on "Skill"("season");
CREATE INDEX lfg_post_author_id on "LFGPost"("authorId");
CREATE INDEX lfg_post_team_id on "LFGPost"("teamId");
CREATE INDEX skill_user_id_season on "Skill" ("userId", "season");
CREATE INDEX user_friend_code_user_id on "UserFriendCode"("userId");
CREATE INDEX tournament_organization_slug on "TournamentOrganization"("slug");
CREATE INDEX tournament_organization_series_organization_id on "TournamentOrganizationSeries"("organizationId");
CREATE INDEX calendar_event_organization_id on "CalendarEvent"("organizationId");
CREATE INDEX tournament_result_tournament_team_id on "TournamentResult"("tournamentTeamId");
CREATE INDEX badge_author_id on "Badge"("authorId");
CREATE INDEX tournament_bracket_progression_override_tournament_id on "TournamentBracketProgressionOverride"("tournamentId");
CREATE INDEX notification_type on "Notification"("type");
CREATE INDEX notification_user_id on "NotificationUser"("userId");
CREATE INDEX notification_push_url_user_id on "NotificationUserSubscription"("userId");
CREATE INDEX scrim_post_team_id on "ScrimPost"("teamId");
CREATE INDEX scrim_post_at on "ScrimPost"("at");
CREATE INDEX scrim_post_request_scrim_post_id on "ScrimPostRequest"("scrimPostId");
CREATE INDEX scrim_post_request_team_id on "ScrimPostRequest"("teamId");
CREATE INDEX scrim_post_request_user_scrim_post_request_id on "ScrimPostRequestUser"("scrimPostRequestId");
CREATE INDEX scrim_post_request_user_user_id on "ScrimPostRequestUser"("userId");
CREATE INDEX association_member_user_id on "AssociationMember"("userId");
CREATE INDEX association_member_association_id on "AssociationMember"("associationId");
CREATE VIEW "BadgeOwner" as
      select "userId", "badgeId" from "TournamentBadgeOwner"
        union all
      select 
        "id" as "userId",
        case
          when "patronTier" = 2 then 40
          else 41
        end "badgeId"
      from "User"
      where "patronTier" > 1
/* BadgeOwner(userId,badgeId) */;
CREATE VIEW "UserSubmittedImage"
      as
      select * from "UnvalidatedUserSubmittedImage" where "validatedAt" is not null
/* UserSubmittedImage(id,validatedAt,url,submitterUserId) */;
CREATE VIEW "Team"
      as
      select * from "AllTeam" where "deletedAt" is null
/* Team(id,name,customUrl,inviteCode,bio,avatarImgId,bannerImgId,createdAt,deletedAt,css,bsky) */;
CREATE VIEW "FreshPlusTier" as
    select
      "votedId" as "userId",
      min(
        case
          when "passedVoting" = 0
            and "wasSuggested" = 1 then null
          when "passedVoting" = 1 then "tier"
          when "passedVoting" = 0
            and "tier" != 3 then "tier" + 1
        end
      ) as "tier"
    from
      "PlusVotingResult"
    where
      year = (
        select
          "year"
        from
          "PlusVote"
        where
          "validAfter" < strftime('%s', 'now')
        order by
          "year" desc,
          "month" desc
        limit
          1
      )
      and "month" = (
        select
          "month"
        from
          "PlusVote"
        where
          "validAfter" < strftime('%s', 'now')
        order by
          "year" desc,
          "month" desc
        limit
          1
      )
      group by
        "votedId"
/* FreshPlusTier(userId,tier) */;
CREATE VIEW "Video"
      as
      select * from "UnvalidatedVideo" where "validatedAt" is not null
/* Video(id,title,type,youtubeId,youtubeDate,submitterUserId,validatedAt,eventId) */;
CREATE VIEW "PlusVotingResult" as
      select
        "votedId",
        "tier",
        avg("score") as "score",
        avg("score") >= 0.2 as "passedVoting",
        "month",
        "year",
        exists (
          select
            1
          from
            "PlusSuggestion"
          where
            "PlusSuggestion"."month" = "PlusVote"."month"
            and "PlusSuggestion"."year" = "PlusVote"."year"
            and "PlusSuggestion"."suggestedId" = "PlusVote"."votedId"
            and "PlusSuggestion"."tier" = "PlusVote"."tier"
        ) as "wasSuggested"
      from
        "PlusVote"
      group by
        "votedId",
        "tier",
        "month",
        "year"
/* PlusVotingResult(votedId,tier,score,passedVoting,month,year,wasSuggested) */;
CREATE VIEW "TeamMember"
        as
        select "AllTeamMember".* 
        from "AllTeamMember"
          left join "Team" on "Team"."id" = "AllTeamMember"."teamId"
        where "AllTeamMember"."leftAt" is null 
          and 
        -- if team id is null the team is deleted
        "Team"."id" is not null
          and
        "AllTeamMember"."isMainTeam" = 1
/* TeamMember(teamId,userId,role,isOwner,createdAt,leftAt,isMainTeam,isManager) */;
CREATE VIEW "TeamMemberWithSecondary"
        as
        select "AllTeamMember".* 
        from "AllTeamMember"
          left join "Team" on "Team"."id" = "AllTeamMember"."teamId"
        where "AllTeamMember"."leftAt" is null 
          and 
        -- if team id is null the team is deleted
        "Team"."id" is not null
/* TeamMemberWithSecondary(teamId,userId,role,isOwner,createdAt,leftAt,isMainTeam,isManager) */;
CREATE TABLE IF NOT EXISTS "BanLog" (
				"id" integer primary key,
				"userId" integer not null,
				"banned" integer,
				"bannedReason" text,
				"bannedByUserId" integer not null,
				"createdAt" integer default (strftime('%s', 'now')) not null,
				foreign key ("userId") references "User"("id") on delete restrict,
				foreign key ("bannedByUserId") references "User"("id") on delete restrict
			);
CREATE INDEX ban_log_user_id on "BanLog"("userId");
CREATE TABLE IF NOT EXISTS "ModNote" (
				"id" integer primary key,
				"userId" integer not null,
				"authorId" integer not null,
				"text" text not null,
				"createdAt" integer default (strftime('%s', 'now')) not null,
				"isDeleted" integer not null default 0,
				foreign key ("userId") references "User"("id") on delete restrict,
				foreign key ("authorId") references "User"("id") on delete restrict
			);
CREATE INDEX mod_note_user_id on "ModNote"("userId");
CREATE TABLE IF NOT EXISTS "TournamentOrganizationBannedUser" (
          "organizationId" integer not null references "TournamentOrganization"("id") on delete cascade,
          "userId" integer not null references "User"("id") on delete restrict,
          "privateNote" text,
          "updatedAt" integer default (strftime('%s', 'now')) not null,
          unique("organizationId", "userId") on conflict replace
        );
CREATE INDEX tournament_team_team_id on "TournamentTeam"("teamId");
CREATE UNIQUE INDEX badge_owner_tournament_user_unique on "TournamentBadgeOwner"("tournamentId", "userId");
