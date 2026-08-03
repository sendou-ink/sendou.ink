create table "User" (
	"id" integer primary key,
	"discordId" text unique not null,
	"discordName" text not null,
	"discordAvatar" text,
	"twitch" text,
	"youtubeId" text,
	"bio" text,
	"country" text,
	"patronTier" integer,
	"patronStartedAt" integer,
	"customUrl" text,
	"stickSens" integer,
	"motionSens" integer,
	"inGameName" text,
	"patronExpiresAt" integer,
	"discordUniqueName" text,
	"showDiscordUniqueName" integer not null default 1,
	"commissionText" text,
	"banned" integer default 0,
	"vc" text default "NO",
	"languages" text,
	"plusSkippedForSeasonNth" integer,
	"mapModePreferences" text,
	"weaponPool" text,
	"noScreen" integer default 0,
	"bannedReason" text,
	"customName" text,
	"username" text generated always as (coalesce("customName", "discordName")) virtual,
	"battlefy" text,
	"buildSorting" text,
	"bsky" text,
	"preferences" text,
	"favoriteBadgeIds" text,
	"createdAt" integer,
	"commissionsOpenedAt" integer,
	"pronouns" text default null,
	"customTheme" text default null,
	"joinOrder" integer,
	"customAvatarImgId" integer,
	"shortBio" text,
	"div" text,
	"unverifiedPeakXP" text,
	"bannerPresetImg" text,
	"bannerImgId" integer,
	"hiddenCardStats" text,
	"isArtist" integer not null default 0,
	"isVideoAdder" integer not null default 0,
	"isTournamentOrganizer" integer not null default 0,
	"isApiAccesser" integer not null default 0,
	"commissionsOpen" integer not null default 0,
	"favoriteTrophyIds" text,
	"hiddenTrophyIds" text
) strict;
--> statement-breakpoint
create table "PlusSuggestion" (
	"id" integer primary key,
	"text" text not null,
	"authorId" integer not null,
	"suggestedId" integer not null,
	"month" integer not null,
	"year" integer not null,
	"tier" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"updatedAt" integer,
	foreign key ("authorId") references "User" ("id") on delete cascade,
	foreign key ("suggestedId") references "User" ("id") on delete cascade,
	unique (
		"month",
		"year",
		"suggestedId",
		"authorId",
		"tier"
	)
	on conflict rollback
) strict;
--> statement-breakpoint
create index plus_suggestion_author_id on "PlusSuggestion" ("authorId");
--> statement-breakpoint
create index plus_suggestion_suggested_id on "PlusSuggestion" ("suggestedId");
--> statement-breakpoint
create table "PlusVote" (
	"month" integer not null,
	"year" integer not null,
	"tier" integer not null,
	"authorId" integer not null,
	"votedId" integer not null,
	"score" integer not null,
	"becomesValidAt" integer not null,
	foreign key ("authorId") references "User" ("id") on delete cascade,
	foreign key ("votedId") references "User" ("id") on delete cascade,
	unique ("month", "year", "authorId", "votedId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index plus_vote_author_id on "PlusVote" ("authorId");
--> statement-breakpoint
create index plus_vote_voted_id on "PlusVote" ("votedId");
--> statement-breakpoint
create table "Badge" (
	"id" integer primary key,
	"code" text not null,
	"displayName" text not null,
	"hue" integer,
	"authorId" integer
) strict;
--> statement-breakpoint
create table "TournamentBadgeOwner" (
	"badgeId" integer not null,
	"userId" integer not null,
	"tournamentId" integer,
	"count" integer not null default 1
) strict;
--> statement-breakpoint
create table "BadgeManager" (
	"badgeId" integer not null,
	"userId" integer not null,
	unique ("badgeId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "CalendarEvent" (
	"id" integer primary key,
	"name" text not null,
	"authorId" integer not null,
	"bracketUrl" text not null,
	"description" text,
	"discordInviteCode" text,
	"discordUrl" text generated always as ('https://discord.gg/' || "discordInviteCode") virtual,
	"participantCount" integer,
	"tags" text,
	"tournamentId" integer,
	"avatarImgId" integer,
	"organizationId" integer references "TournamentOrganization" ("id") on delete set null,
	"hidden" integer default 0,
	"trophyId" integer references "Trophy" ("id") on delete set null,
	foreign key ("authorId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create table "CalendarEventDate" (
	"id" integer primary key,
	"eventId" integer not null,
	"startsAt" integer not null,
	foreign key ("eventId") references "CalendarEvent" ("id") on delete cascade
) strict;
--> statement-breakpoint
create table "CalendarEventResultTeam" (
	"id" integer primary key,
	"eventId" integer not null,
	"name" text not null,
	"placement" integer not null,
	foreign key ("eventId") references "CalendarEvent" ("id") on delete cascade
) strict;
--> statement-breakpoint
create table "CalendarEventResultPlayer" (
	"teamId" integer not null,
	"userId" integer,
	"name" text,
	foreign key ("teamId") references "CalendarEventResultTeam" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create table "CalendarEventBadge" (
	"eventId" integer not null,
	"badgeId" integer not null,
	foreign key ("eventId") references "CalendarEvent" ("id") on delete cascade,
	foreign key ("badgeId") references "Badge" ("id") on delete restrict,
	unique ("eventId", "badgeId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "BuildWeapon" (
	"buildId" integer not null,
	"weaponSplId" integer not null,
	"updatedAt" integer default 1760608251,
	"sortValue" integer,
	"canonicalWeaponSplId" integer,
	foreign key ("buildId") references "Build" ("id") on delete cascade,
	unique ("buildId", "weaponSplId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index build_weapon_build_id on "BuildWeapon" ("buildId");
--> statement-breakpoint
create unique index user_custom_url_unique on "User" ("customUrl");
--> statement-breakpoint
create table "MapPoolMap" (
	"calendarEventId" integer,
	"stageId" integer not null,
	"mode" text not null,
	"tournamentTeamId" integer,
	"tieBreakerCalendarEventId" integer,
	foreign key ("calendarEventId") references "CalendarEvent" ("id") on delete cascade,
	unique ("calendarEventId", "stageId", "mode")
	on conflict rollback
) strict;
--> statement-breakpoint
create index map_pool_map_calendar_event_id on "MapPoolMap" ("calendarEventId");
--> statement-breakpoint
create table "UserResultHighlight" (
	"teamId" integer not null,
	"userId" integer not null,
	foreign key ("teamId") references "CalendarEventResultTeam" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("teamId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index user_result_highlight_user_id on "UserResultHighlight" ("userId");
--> statement-breakpoint
create index user_result_highlight_team_id on "UserResultHighlight" ("teamId");
--> statement-breakpoint
create index map_pool_map_tournament_team_id on "MapPoolMap" ("tournamentTeamId");
--> statement-breakpoint
create index map_pool_map_tie_breaker_calendar_event_id on "MapPoolMap" ("tieBreakerCalendarEventId");
--> statement-breakpoint
create table "UserWeapon" (
	"userId" integer not null,
	"weaponSplId" integer not null,
	"order" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"isFavorite" integer not null default 0,
	unique ("userId", "weaponSplId")
	on conflict rollback,
	unique ("userId", "order")
	on conflict rollback,
	foreign key ("userId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index user_weapon_user_id on "UserWeapon" ("userId");
--> statement-breakpoint
create view "UserSubmittedImage" as
select
	*
from
	"UnvalidatedUserSubmittedImage"
where
	"validatedAt" is not null;
--> statement-breakpoint
create table "AllTeam" (
	"id" integer primary key,
	"name" text not null,
	"customUrl" text not null,
	"inviteCode" text not null,
	"bio" text,
	"avatarImgId" integer,
	"bannerImgId" integer,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"deletedAt" integer,
	"bsky" text,
	"tag" text,
	"customTheme" text default null,
	"mapModePreferences" text,
	foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage" ("id") on delete set null,
	foreign key ("bannerImgId") references "UnvalidatedUserSubmittedImage" ("id") on delete set null
) strict;
--> statement-breakpoint
create index team_custom_url on "AllTeam" ("customUrl");
--> statement-breakpoint
create view "Team" as
select
	*
from
	"AllTeam"
where
	"deletedAt" is null;
--> statement-breakpoint
create table "AllTeamMember" (
	"teamId" integer not null,
	"userId" integer not null,
	"role" text,
	"isOwner" integer not null default 0,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"leftAt" integer,
	"isMainTeam" integer default 1,
	"isManager" integer default 0,
	"customRole" text,
	"roleType" text,
	"order" integer not null default 0,
	foreign key ("teamId") references "AllTeam" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("teamId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "UnvalidatedUserSubmittedImage" (
	"id" integer primary key,
	"validatedAt" integer,
	"url" text not null unique,
	"submitterUserId" integer not null,
	foreign key ("submitterUserId") references "User" ("id") on delete set null
) strict;
--> statement-breakpoint
create index submitter_user_id on "UnvalidatedUserSubmittedImage" ("submitterUserId");
--> statement-breakpoint
create table "PlusTier" (
	"userId" integer primary key,
	"tier" integer not null,
	foreign key ("userId") references "User" ("id") on delete set null
) strict;
--> statement-breakpoint
create table "UnvalidatedVideo" (
	"id" integer primary key,
	"title" text not null,
	"type" text not null,
	"youtubeId" text not null,
	"youtubePublishedAt" integer not null,
	"submitterUserId" integer not null,
	"validatedAt" integer,
	"eventId" integer,
	foreign key ("submitterUserId") references "User" ("id") on delete restrict,
	foreign key ("eventId") references "CalendarEvent" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index video_event_id on "UnvalidatedVideo" ("eventId");
--> statement-breakpoint
create view "Video" as
select
	*
from
	"UnvalidatedVideo"
where
	"validatedAt" is not null;
--> statement-breakpoint
create table "VideoMatch" (
	"id" integer primary key,
	"videoId" integer not null,
	"startsAt" integer not null,
	"stageId" integer not null,
	"mode" text not null,
	foreign key ("videoId") references "UnvalidatedVideo" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index video_match_video_id on "VideoMatch" ("videoId");
--> statement-breakpoint
create table "VideoMatchPlayer" (
	"videoMatchId" integer not null,
	"playerUserId" integer,
	"playerName" text,
	"weaponSplId" integer not null,
	"player" integer not null,
	foreign key ("videoMatchId") references "VideoMatch" ("id") on delete cascade,
	foreign key ("playerUserId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index video_match_player_video_match_id on "VideoMatchPlayer" ("videoMatchId");
--> statement-breakpoint
create index video_match_player_player_user_id on "VideoMatchPlayer" ("playerUserId");
--> statement-breakpoint
create table "XRankPlacement" (
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
	foreign key ("playerId") references "SplatoonPlayer" ("id") on delete cascade,
	unique ("rank", "month", "year", "region", "mode")
	on conflict rollback
) strict;
--> statement-breakpoint
create index splatoon_placement_player_id on "XRankPlacement" ("playerId");
--> statement-breakpoint
create index calendar_event_tournament_id on "CalendarEvent" ("tournamentId");
--> statement-breakpoint
create table "Tournament" (
	"id" integer primary key,
	"mapPickingStyle" text not null,
	"castTwitchAccounts" text,
	"settings" text not null default '{"bracketProgression":[{"type":"double_elimination","name":"Main bracket"}]}',
	"castedMatchesInfo" text,
	"rules" text,
	"preparedMaps" text,
	"parentTournamentId" integer references "Tournament" ("id") on delete restrict,
	"isFinalized" integer not null default 0,
	"seedingSnapshot" text default null,
	"tier" integer,
	"vodsLastSyncAt" integer,
	"vodsSyncCount" integer not null default 0
) strict;
--> statement-breakpoint
create table "TournamentTeam" (
	"id" integer primary key,
	"name" text not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"seed" integer,
	"inviteCode" text not null unique,
	"tournamentId" integer not null,
	"prefersNotToHost" integer not null default 0,
	"teamId" integer,
	"droppedOut" integer default 0,
	"activeRosterUserIds" text,
	"avatarImgId" integer,
	"startingBracketIdx" integer,
	"isLooking" integer not null default 0,
	"isPlaceholder" integer not null default 0,
	"lfgNote" text,
	"chatCode" text,
	"abDivision" integer,
	"tournamentTeamHistoryId" integer references "TournamentTeamHistory" ("id"),
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade,
	unique ("tournamentId", "name")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_team_tournament_id on "TournamentTeam" ("tournamentId");
--> statement-breakpoint
create table "TournamentTeamCheckIn" (
	"tournamentTeamId" integer not null,
	"checkedInAt" integer not null,
	"bracketIdx" integer,
	"isCheckOut" integer default 0,
	foreign key ("tournamentTeamId") references "TournamentTeam" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index tournament_team_check_in_tournament_team_id on "TournamentTeamCheckIn" ("tournamentTeamId");
--> statement-breakpoint
create table "TournamentTeamMember" (
	"tournamentTeamId" integer not null,
	"userId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"inGameName" text,
	"role" text not null default 'REGULAR',
	"isStayAsSub" integer not null default 0,
	"isLooking" integer not null default 0,
	"isSub" integer not null default 0,
	foreign key ("tournamentTeamId") references "TournamentTeam" ("id") on delete cascade,
	unique ("tournamentTeamId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_team_member_tournament_team_id on "TournamentTeamMember" ("tournamentTeamId");
--> statement-breakpoint
create table "TournamentGroup" (
	"id" integer primary key,
	"stageId" integer not null,
	"number" integer not null,
	foreign key ("stageId") references "TournamentStage" ("id") on delete cascade,
	unique ("number", "stageId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_group_stage_id on "TournamentGroup" ("stageId");
--> statement-breakpoint
create table "TournamentRound" (
	"id" integer primary key,
	"stageId" integer not null,
	"groupId" integer not null,
	"number" integer not null,
	"maps" text,
	foreign key ("stageId") references "TournamentStage" ("id") on delete cascade,
	foreign key ("groupId") references "TournamentGroup" ("id") on delete cascade,
	unique ("number", "groupId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_round_stage_id on "TournamentRound" ("stageId");
--> statement-breakpoint
create index tournament_round_group_id on "TournamentRound" ("groupId");
--> statement-breakpoint
create table "TournamentMatchGameResult" (
	"id" integer primary key,
	"matchId" integer not null,
	"number" integer not null,
	"stageId" integer not null,
	"mode" text not null,
	"source" text not null,
	"winnerTeamId" integer not null,
	"reporterId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"ko" integer,
	foreign key ("matchId") references "TournamentMatch" ("id") on delete cascade,
	foreign key ("winnerTeamId") references "TournamentTeam" ("id") on delete restrict,
	foreign key ("reporterId") references "User" ("id") on delete restrict,
	unique ("matchId", "number")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_match_game_result_match_id on "TournamentMatchGameResult" ("matchId");
--> statement-breakpoint
create index tournament_match_game_result_winner_team_id on "TournamentMatchGameResult" ("winnerTeamId");
--> statement-breakpoint
create table "TournamentMatchGameResultParticipant" (
	"matchGameResultId" integer not null,
	"userId" integer not null,
	"tournamentTeamId" integer,
	foreign key ("matchGameResultId") references "TournamentMatchGameResult" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("matchGameResultId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_match_game_result_participant_match_game_result_id on "TournamentMatchGameResultParticipant" ("matchGameResultId");
--> statement-breakpoint
create index tournament_match_game_result_participant_user_id on "TournamentMatchGameResultParticipant" ("userId");
--> statement-breakpoint
create table "TrustRelationship" (
	"trustGiverUserId" integer not null,
	"trustReceiverUserId" integer not null,
	"lastUsedAt" integer default 0,
	foreign key ("trustGiverUserId") references "User" ("id") on delete cascade,
	foreign key ("trustReceiverUserId") references "User" ("id") on delete cascade,
	unique ("trustGiverUserId", "trustReceiverUserId")
	on conflict ignore
) strict;
--> statement-breakpoint
create index trust_relationship_trust_giver_user_id on "TrustRelationship" ("trustGiverUserId");
--> statement-breakpoint
create index trust_relationship_trust_receiver_user_id on "TrustRelationship" ("trustReceiverUserId");
--> statement-breakpoint
create table "Skill" (
	"id" integer primary key,
	"mu" real not null,
	"sigma" real not null,
	"ordinal" real not null,
	"userId" integer,
	"identifier" text,
	"matchesCount" integer not null,
	"tournamentId" integer,
	"groupMatchId" integer,
	"season" integer not null,
	"createdAt" integer,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("tournamentId") references "Tournament" ("id") on delete restrict,
	unique ("userId", "tournamentId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index skill_user_id on "Skill" ("userId");
--> statement-breakpoint
create index skill_tournament_id on "Skill" ("tournamentId");
--> statement-breakpoint
create table "SkillTeamUser" (
	"userId" integer not null,
	"skillId" integer not null,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("skillId") references "Skill" ("id") on delete cascade,
	unique ("userId", "skillId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index skill_team_user_user_id on "SkillTeamUser" ("userId");
--> statement-breakpoint
create index skill_team_user_skill_id on "SkillTeamUser" ("skillId");
--> statement-breakpoint
create table "TournamentResult" (
	"tournamentId" integer not null,
	"userId" integer not null,
	"placement" integer not null,
	"isHighlight" integer not null default 0,
	"participantCount" integer not null,
	"tournamentTeamId" integer not null,
	"setResults" text not null default '[]',
	"spDiff" real,
	"div" text,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade,
	foreign key ("tournamentTeamId") references "TournamentTeam" ("id") on delete cascade,
	unique ("userId", "tournamentId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_result_user_id on "TournamentResult" ("userId");
--> statement-breakpoint
create index tournament_result_tournament_id on "TournamentResult" ("tournamentId");
--> statement-breakpoint
create table "Art" (
	"id" integer primary key,
	"imgId" integer not null,
	"authorId" integer not null,
	"isShowcase" integer not null default 0,
	"description" text,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("authorId") references "User" ("id") on delete restrict,
	foreign key ("imgId") references "UnvalidatedUserSubmittedImage" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index art_author_id on "Art" ("authorId");
--> statement-breakpoint
create index art_img_id on "Art" ("imgId");
--> statement-breakpoint
create table "ArtUserMetadata" (
	"artId" integer not null,
	"userId" integer not null,
	foreign key ("artId") references "Art" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index art_user_metadata_art_id on "ArtUserMetadata" ("artId");
--> statement-breakpoint
create index art_user_metadata_user_id on "ArtUserMetadata" ("userId");
--> statement-breakpoint
create table "ArtTag" (
	"id" integer primary key,
	"name" text unique not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"authorId" integer not null,
	foreign key ("authorId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create table "TaggedArt" (
	"artId" integer not null,
	"tagId" integer not null,
	foreign key ("artId") references "Art" ("id") on delete cascade,
	foreign key ("tagId") references "ArtTag" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index tagged_art_art_id on "TaggedArt" ("artId");
--> statement-breakpoint
create index tagged_art_tag_id on "TaggedArt" ("tagId");
--> statement-breakpoint
create index skill_identifier on "Skill" ("identifier");
--> statement-breakpoint
create index skill_group_match_id on "Skill" ("groupMatchId");
--> statement-breakpoint
create table "MapResult" (
	"mode" text not null,
	"stageId" integer not null,
	"userId" integer not null,
	"wins" integer not null,
	"losses" integer not null,
	"season" integer not null,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("userId", "stageId", "mode", "season")
	on conflict rollback
) strict;
--> statement-breakpoint
create index map_result_user_id on "MapResult" ("userId");
--> statement-breakpoint
create table "PlayerResult" (
	"ownerUserId" integer not null,
	"otherUserId" integer not null,
	"mapWins" integer not null,
	"mapLosses" integer not null,
	"setWins" integer not null,
	"setLosses" integer not null,
	"type" text not null,
	"season" integer not null,
	foreign key ("ownerUserId") references "User" ("id") on delete cascade,
	foreign key ("otherUserId") references "User" ("id") on delete cascade,
	unique ("ownerUserId", "otherUserId", "type", "season")
	on conflict rollback
) strict;
--> statement-breakpoint
create index player_result_owner_user_id on "PlayerResult" ("ownerUserId");
--> statement-breakpoint
create index player_result_other_user_id on "PlayerResult" ("otherUserId");
--> statement-breakpoint
create table "Group" (
	"id" integer primary key,
	"teamId" integer,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"latestActionAt" integer default (strftime('%s', 'now')) not null,
	"inviteCode" text not null,
	"status" text not null,
	"chatCode" text,
	"matchmade" integer default 0 not null,
	foreign key ("teamId") references "AllTeam" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index group_team_id on "Group" ("teamId");
--> statement-breakpoint
create table "GroupMember" (
	"groupId" integer not null,
	"userId" integer not null,
	"role" text not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"note" text,
	foreign key ("userId") references "User" ("id") on delete restrict,
	foreign key ("groupId") references "Group" ("id") on delete cascade,
	unique ("userId", "groupId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index group_member_group_id on "GroupMember" ("groupId");
--> statement-breakpoint
create index group_member_user_id on "GroupMember" ("userId");
--> statement-breakpoint
create table "GroupLike" (
	"likerGroupId" integer not null,
	"targetGroupId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"isRechallenge" integer not null default 0,
	foreign key ("likerGroupId") references "Group" ("id") on delete cascade,
	foreign key ("targetGroupId") references "Group" ("id") on delete cascade,
	unique ("likerGroupId", "targetGroupId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index group_like_liker_group_id on "GroupLike" ("likerGroupId");
--> statement-breakpoint
create index group_like_target_group_id on "GroupLike" ("targetGroupId");
--> statement-breakpoint
create table "GroupMatchMap" (
	"id" integer primary key,
	"matchId" integer not null,
	"index" integer not null,
	"mode" text not null,
	"stageId" integer not null,
	"source" text not null,
	"winnerGroupId" integer,
	"reportedAt" integer,
	"reportedByUserId" integer references "User" ("id"),
	foreign key ("matchId") references "GroupMatch" ("id") on delete cascade,
	foreign key ("winnerGroupId") references "Group" ("id") on delete restrict,
	unique ("matchId", "index")
	on conflict rollback
) strict;
--> statement-breakpoint
create index group_match_map_match_id on "GroupMatchMap" ("matchId");
--> statement-breakpoint
create index group_match_map_winner_group_id on "GroupMatchMap" ("winnerGroupId");
--> statement-breakpoint
create table "LogInLink" (
	"code" text unique not null,
	"expiresAt" integer not null,
	"userId" integer not null,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index user_patron_tier on "User" ("patronTier");
--> statement-breakpoint
create index calendar_event_result_player_user_id on "CalendarEventResultPlayer" ("userId");
--> statement-breakpoint
create index calendar_event_result_player_team_id on "CalendarEventResultPlayer" ("teamId");
--> statement-breakpoint
create table "PrivateUserNote" (
	"authorId" integer not null,
	"targetId" integer not null,
	"text" text,
	"sentiment" text not null,
	"updatedAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("authorId") references "User" ("id") on delete cascade,
	foreign key ("targetId") references "User" ("id") on delete cascade,
	unique ("authorId", "targetId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "TournamentStaff" (
	"tournamentId" integer not null,
	"userId" integer not null,
	"role" text not null,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("tournamentId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "UserFriendCode" (
	"friendCode" text not null,
	"userId" integer not null,
	"submitterUserId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("submitterUserId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index skill_season on "Skill" ("season");
--> statement-breakpoint
create table "LFGPost" (
	"id" integer primary key,
	"type" text not null,
	"text" text not null,
	"timezone" text not null,
	"authorId" integer not null,
	"teamId" integer,
	"plusTierVisibility" integer,
	"updatedAt" integer default (strftime('%s', 'now')) not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"languages" text,
	foreign key ("authorId") references "User" ("id") on delete restrict,
	foreign key ("teamId") references "AllTeam" ("id") on delete cascade,
	unique ("authorId", "type")
	on conflict rollback
) strict;
--> statement-breakpoint
create index lfg_post_author_id on "LFGPost" ("authorId");
--> statement-breakpoint
create index lfg_post_team_id on "LFGPost" ("teamId");
--> statement-breakpoint
create index skill_user_id_season on "Skill" ("userId", "season");
--> statement-breakpoint
create index user_friend_code_user_id on "UserFriendCode" ("userId");
--> statement-breakpoint
create table "TournamentOrganization" (
	"id" integer primary key,
	"name" text not null,
	"slug" text unique not null,
	"description" text,
	"socials" text,
	"avatarImgId" integer,
	"isEstablished" integer not null default 0,
	foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage" ("id") on delete set null
) strict;
--> statement-breakpoint
create index tournament_organization_slug on "TournamentOrganization" ("slug");
--> statement-breakpoint
create table "TournamentOrganizationMember" (
	"organizationId" integer not null,
	"userId" integer not null,
	"role" text not null,
	"roleDisplayName" text,
	foreign key ("organizationId") references "TournamentOrganization" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("organizationId", "userId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "TournamentOrganizationBadge" (
	"organizationId" integer not null,
	"badgeId" integer not null,
	foreign key ("organizationId") references "TournamentOrganization" ("id") on delete cascade,
	foreign key ("badgeId") references "Badge" ("id") on delete cascade,
	unique ("organizationId", "badgeId")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "TournamentOrganizationSeries" (
	"id" integer primary key,
	"organizationId" integer not null,
	"name" text not null,
	"description" text,
	"substringMatches" text not null,
	"showLeaderboard" integer not null default 0,
	"tierHistory" text,
	foreign key ("organizationId") references "TournamentOrganization" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index tournament_organization_series_organization_id on "TournamentOrganizationSeries" ("organizationId");
--> statement-breakpoint
create index calendar_event_organization_id on "CalendarEvent" ("organizationId");
--> statement-breakpoint
create index tournament_result_tournament_team_id on "TournamentResult" ("tournamentTeamId");
--> statement-breakpoint
create view "TeamMember" as
select
	"AllTeamMember".*
from
	"AllTeamMember"
	left join "Team" on "Team"."id" = "AllTeamMember"."teamId"
where
	"AllTeamMember"."leftAt" is null
	and
	-- if team id is null the team is deleted
	"Team"."id" is not null
	and "AllTeamMember"."isMainTeam" = 1;
--> statement-breakpoint
create view "TeamMemberWithSecondary" as
select
	"AllTeamMember".*
from
	"AllTeamMember"
	left join "Team" on "Team"."id" = "AllTeamMember"."teamId"
where
	"AllTeamMember"."leftAt" is null
	and
	-- if team id is null the team is deleted
	"Team"."id" is not null;
--> statement-breakpoint
create index badge_author_id on "Badge" ("authorId");
--> statement-breakpoint
create table "SeedingSkill" (
	"mu" real not null,
	"sigma" real not null,
	"ordinal" real not null,
	"userId" integer not null,
	"type" text not null,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("userId", "type")
	on conflict replace
) strict;
--> statement-breakpoint
create table "TournamentBracketProgressionOverride" (
	"sourceBracketIdx" integer not null,
	"destinationBracketIdx" integer not null,
	"tournamentTeamId" integer not null,
	"tournamentId" integer not null,
	unique ("sourceBracketIdx", "tournamentTeamId")
	on conflict replace,
	foreign key ("tournamentTeamId") references "TournamentTeam" ("id") on delete cascade,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index tournament_bracket_progression_override_tournament_id on "TournamentBracketProgressionOverride" ("tournamentId");
--> statement-breakpoint
create table "Notification" (
	"id" integer primary key,
	"type" text not null,
	"meta" text,
	"pictureUrl" text,
	"createdAt" integer default (strftime('%s', 'now')) not null
) strict;
--> statement-breakpoint
create index notification_type on "Notification" ("type");
--> statement-breakpoint
create table "NotificationUser" (
	"notificationId" integer not null,
	"userId" integer not null,
	"seen" integer default 0 not null,
	unique ("notificationId", "userId"),
	foreign key ("notificationId") references "Notification" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index notification_user_id on "NotificationUser" ("userId");
--> statement-breakpoint
create table "NotificationUserSubscription" (
	"id" integer primary key,
	"userId" integer not null,
	"subscription" text not null,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index notification_push_url_user_id on "NotificationUserSubscription" ("userId");
--> statement-breakpoint
create table "ScrimPost" (
	"id" integer primary key,
	"startsAt" integer not null,
	"maxDiv" integer,
	"minDiv" integer,
	"visibility" text,
	"text" text,
	"chatCode" text not null,
	"teamId" integer,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"updatedAt" integer default (strftime('%s', 'now')) not null,
	"managedByAnyone" integer default 0 not null,
	"canceledAt" integer,
	"canceledByUserId" integer references "User" ("id") on delete restrict,
	"cancelReason" text,
	"isScheduledForFuture" integer default 1,
	"rangeEndsAt" integer,
	"maps" text,
	"mapsTournamentId" integer references "Tournament" ("id") on delete cascade,
	foreign key ("teamId") references "AllTeam" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index scrim_post_team_id on "ScrimPost" ("teamId");
--> statement-breakpoint
create table "ScrimPostUser" (
	"scrimPostId" integer not null,
	"userId" integer not null,
	"isOwner" integer not null,
	unique ("scrimPostId", "userId")
	on conflict rollback,
	foreign key ("scrimPostId") references "ScrimPost" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create table "ScrimPostRequest" (
	"id" integer primary key,
	"scrimPostId" integer not null,
	"teamId" integer,
	"isAccepted" integer default 0 not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"message" text,
	"startsAt" integer,
	unique ("scrimPostId", "teamId")
	on conflict rollback,
	foreign key ("scrimPostId") references "ScrimPost" ("id") on delete cascade,
	foreign key ("teamId") references "AllTeam" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index scrim_post_request_scrim_post_id on "ScrimPostRequest" ("scrimPostId");
--> statement-breakpoint
create index scrim_post_request_team_id on "ScrimPostRequest" ("teamId");
--> statement-breakpoint
create table "ScrimPostRequestUser" (
	"scrimPostRequestId" integer not null,
	"userId" integer not null,
	"isOwner" integer not null,
	unique ("scrimPostRequestId", "userId")
	on conflict rollback,
	foreign key ("scrimPostRequestId") references "ScrimPostRequest" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index scrim_post_request_user_scrim_post_request_id on "ScrimPostRequestUser" ("scrimPostRequestId");
--> statement-breakpoint
create index scrim_post_request_user_user_id on "ScrimPostRequestUser" ("userId");
--> statement-breakpoint
create table "Association" (
	"id" integer primary key,
	"name" text not null,
	"inviteCode" text not null unique,
	"createdAt" integer default (strftime('%s', 'now')) not null
) strict;
--> statement-breakpoint
create table "AssociationMember" (
	"userId" integer not null,
	"associationId" integer not null,
	"role" text not null,
	unique ("userId", "associationId")
	on conflict rollback,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("associationId") references "Association" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index association_member_user_id on "AssociationMember" ("userId");
--> statement-breakpoint
create index association_member_association_id on "AssociationMember" ("associationId");
--> statement-breakpoint
create table "BanLog" (
	"id" integer primary key,
	"userId" integer not null,
	"banned" integer,
	"bannedReason" text,
	"bannedByUserId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("userId") references "User" ("id") on delete restrict,
	foreign key ("bannedByUserId") references "User" ("id") on delete restrict
);
--> statement-breakpoint
create index ban_log_user_id on "BanLog" ("userId");
--> statement-breakpoint
create table "ModNote" (
	"id" integer primary key,
	"userId" integer not null,
	"authorId" integer not null,
	"text" text not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"isDeleted" integer not null default 0,
	foreign key ("userId") references "User" ("id") on delete restrict,
	foreign key ("authorId") references "User" ("id") on delete restrict
);
--> statement-breakpoint
create index mod_note_user_id on "ModNote" ("userId");
--> statement-breakpoint
create table "TournamentOrganizationBannedUser" (
	"organizationId" integer not null references "TournamentOrganization" ("id") on delete cascade,
	"userId" integer not null references "User" ("id") on delete restrict,
	"privateNote" text,
	"updatedAt" integer default (strftime('%s', 'now')) not null,
	"expiresAt" integer,
	unique ("organizationId", "userId")
	on conflict replace
);
--> statement-breakpoint
create index tournament_team_team_id on "TournamentTeam" ("teamId");
--> statement-breakpoint
create unique index badge_owner_tournament_user_unique on "TournamentBadgeOwner" ("tournamentId", "userId");
--> statement-breakpoint
create index idx_tmgrp_tournament_team_id on "TournamentMatchGameResultParticipant" ("tournamentTeamId");
--> statement-breakpoint
create index "scrim_post_maps_tournament_id" on "ScrimPost" ("mapsTournamentId");
--> statement-breakpoint
create index map_result_user_id_season on "MapResult" ("userId", "season");
--> statement-breakpoint
create index player_result_owner_user_id_season on "PlayerResult" ("ownerUserId", "season");
--> statement-breakpoint
create table "LiveStream" (
	"id" integer primary key,
	"userId" integer unique,
	"viewerCount" integer not null,
	"thumbnailUrl" text not null,
	"twitch" text,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index user_twitch on "User" ("twitch");
--> statement-breakpoint
create index livestream_twitch on "LiveStream" ("twitch");
--> statement-breakpoint
create table "ApiToken" (
	"id" integer primary key,
	"token" text not null unique,
	"userId" integer not null,
	"type" text not null default 'read',
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create unique index api_token_user_id_type on "ApiToken" ("userId", "type");
--> statement-breakpoint
create table "UserWidget" (
	"userId" integer not null,
	"index" integer not null,
	"widget" text not null,
	primary key ("userId", "index"),
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index user_widget_user_id on "UserWidget" ("userId");
--> statement-breakpoint
create table "Friendship" (
	"id" integer primary key,
	"userOneId" integer not null,
	"userTwoId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	unique ("userOneId", "userTwoId")
	on conflict rollback,
	foreign key ("userOneId") references "User" ("id") on delete cascade,
	foreign key ("userTwoId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index friendship_user_one_id on "Friendship" ("userOneId");
--> statement-breakpoint
create index friendship_user_two_id on "Friendship" ("userTwoId");
--> statement-breakpoint
create table "FriendRequest" (
	"id" integer primary key,
	"senderId" integer not null,
	"receiverId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	unique ("senderId", "receiverId")
	on conflict rollback,
	foreign key ("senderId") references "User" ("id") on delete cascade,
	foreign key ("receiverId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index friend_request_receiver_id on "FriendRequest" ("receiverId");
--> statement-breakpoint
create index all_team_member_user_id on "AllTeamMember" ("userId");
--> statement-breakpoint
create table "SavedCalendarEvent" (
	"id" integer primary key,
	"userId" integer not null,
	"calendarEventId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	unique ("userId", "calendarEventId")
	on conflict rollback,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("calendarEventId") references "CalendarEvent" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index saved_calendar_event_user_id on "SavedCalendarEvent" ("userId");
--> statement-breakpoint
create index saved_calendar_event_calendar_event_id on "SavedCalendarEvent" ("calendarEventId");
--> statement-breakpoint
create table "SplatoonRotation" (
	"id" integer primary key,
	"type" text not null,
	"mode" text not null,
	"stageId1" integer not null,
	"stageId2" integer not null,
	"startsAt" integer not null,
	"endsAt" integer not null
) strict;
--> statement-breakpoint
create index tournament_team_member_user_id_is_looking on "TournamentTeamMember" ("userId", "isLooking");
--> statement-breakpoint
create trigger sync_is_looking_on_team_update after
update of isLooking on "TournamentTeam" begin
update "TournamentTeamMember"
set
	"isLooking" = NEW."isLooking"
where
	"tournamentTeamId" = NEW."id";

end;
--> statement-breakpoint
create trigger sync_is_looking_on_member_insert after insert on "TournamentTeamMember" begin
update "TournamentTeamMember"
set
	"isLooking" = (
		select
			"isLooking"
		from
			"TournamentTeam"
		where
			"id" = NEW."tournamentTeamId"
	)
where
	rowid = NEW.rowid;

end;
--> statement-breakpoint
create table "TournamentLFGLike" (
	"likerTeamId" integer not null,
	"targetTeamId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("likerTeamId") references "TournamentTeam" ("id") on delete cascade,
	foreign key ("targetTeamId") references "TournamentTeam" ("id") on delete cascade,
	unique ("likerTeamId", "targetTeamId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_lfg_like_liker_team_id on "TournamentLFGLike" ("likerTeamId");
--> statement-breakpoint
create index tournament_lfg_like_target_team_id on "TournamentLFGLike" ("targetTeamId");
--> statement-breakpoint
create table "TournamentStreamer" (
	"id" integer primary key autoincrement,
	"userId" integer,
	"tournamentId" integer not null,
	"twitchAccount" text not null,
	unique ("twitchAccount", "tournamentId")
	on conflict ignore
) strict;
--> statement-breakpoint
create table "TournamentMatchPickBanEvent" (
	"type" text not null,
	"stageId" integer,
	"mode" text,
	"matchId" integer not null,
	"authorId" integer,
	"number" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("authorId") references "User" ("id") on delete restrict,
	foreign key ("matchId") references "TournamentMatch" ("id") on delete cascade,
	unique ("matchId", "number")
	on conflict rollback
) strict;
--> statement-breakpoint
create index pick_ban_event_author_id on "TournamentMatchPickBanEvent" ("authorId");
--> statement-breakpoint
create index pick_ban_event_match_id on "TournamentMatchPickBanEvent" ("matchId");
--> statement-breakpoint
create table "TournamentMatchVod" (
	"id" integer primary key autoincrement,
	"matchId" integer not null references "TournamentMatch" ("id"),
	"userId" integer references "User" ("id"),
	"platform" text not null,
	"account" text not null,
	"platformVideoId" text not null,
	"timestampSeconds" integer not null,
	"viewCount" integer not null
) strict;
--> statement-breakpoint
create unique index "tournament_match_vod_match_id_account" on "TournamentMatchVod" ("matchId", "account");
--> statement-breakpoint
create table "Build" (
	"id" integer primary key,
	"ownerId" integer not null,
	"title" text not null,
	"description" text,
	"modes" text,
	"headGearSplId" integer,
	"clothesGearSplId" integer,
	"shoesGearSplId" integer,
	"updatedAt" integer default (strftime('%s', 'now')) not null,
	"abilities" text,
	"abilitiesSignature" text,
	"isPrivate" integer not null default 0,
	foreign key ("ownerId") references "User" ("id") on delete restrict
) strict;
--> statement-breakpoint
create index build_owner_id on "Build" ("ownerId");
--> statement-breakpoint
create unique index "tournament_team_check_in_team_bracket_unique" on "TournamentTeamCheckIn" ("tournamentTeamId", coalesce("bracketIdx", -1));
--> statement-breakpoint
create table "GroupMatch" (
	"id" integer primary key,
	"alphaGroupId" integer not null,
	"bravoGroupId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"chatCode" text,
	"memento" text,
	"confirmedAt" integer,
	"confirmedByUserId" integer references "User" ("id"),
	"cancelRequestedByUserId" integer references "User" ("id"),
	"cancelAcceptedByUserId" integer references "User" ("id"),
	"noScreen" integer default 0 not null,
	foreign key ("alphaGroupId") references "Group" ("id") on delete restrict,
	foreign key ("bravoGroupId") references "Group" ("id") on delete restrict,
	unique ("alphaGroupId")
	on conflict rollback,
	unique ("bravoGroupId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index group_match_alpha_group_id on "GroupMatch" ("alphaGroupId");
--> statement-breakpoint
create index group_match_bravo_group_id on "GroupMatch" ("bravoGroupId");
--> statement-breakpoint
create index group_match_created_at on "GroupMatch" ("createdAt");
--> statement-breakpoint
create index group_match_confirmed_at on "GroupMatch" ("confirmedAt");
--> statement-breakpoint
create index group_match_map_reported_at on "GroupMatchMap" ("reportedAt");
--> statement-breakpoint
create table "GroupMatchContinueVote" (
	"id" integer primary key,
	"groupId" integer not null,
	"userId" integer not null,
	"isContinuing" integer not null check ("isContinuing" in (0, 1)),
	"votedAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("groupId") references "Group" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("groupId", "userId")
) strict;
--> statement-breakpoint
create index group_match_continue_vote_group_id on "GroupMatchContinueVote" ("groupId");
--> statement-breakpoint
create view "PlusVotingResult" as
select
	"votedId",
	"tier",
	avg("score") as "score",
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
	"year";
--> statement-breakpoint
create view "BadgeOwner" as
select
	"userId",
	"badgeId",
	"count"
from
	"TournamentBadgeOwner"
union all
select
	"id" as "userId",
	case
		when "patronTier" = 2 then 40
		else 41
	end as "badgeId",
	1 as "count"
from
	"User"
where
	"patronTier" > 1;
--> statement-breakpoint
create index tournament_badge_owner_user_id on "TournamentBadgeOwner" ("userId");
--> statement-breakpoint
create table "ReportedWeapon" (
	"groupMatchId" integer,
	"tournamentMatchId" integer,
	"mapIndex" integer not null,
	"weaponSplId" integer not null,
	"userId" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("groupMatchId") references "GroupMatch" ("id") on delete cascade,
	foreign key ("tournamentMatchId") references "TournamentMatch" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete restrict,
	unique ("groupMatchId", "mapIndex", "userId")
	on conflict rollback,
	unique ("tournamentMatchId", "mapIndex", "userId")
	on conflict rollback,
	check (
		("groupMatchId" is not null) <> ("tournamentMatchId" is not null)
	)
) strict;
--> statement-breakpoint
create index reported_weapon_group_match_id on "ReportedWeapon" ("groupMatchId");
--> statement-breakpoint
create index reported_weapon_tournament_match_id on "ReportedWeapon" ("tournamentMatchId");
--> statement-breakpoint
create index reported_weapon_user_id on "ReportedWeapon" ("userId");
--> statement-breakpoint
create index reported_weapon_user_created_at_weapon on "ReportedWeapon" ("userId", "createdAt", "weaponSplId");
--> statement-breakpoint
create table "BuildAbilitySum" (
	"buildId" integer not null,
	"ability" text not null,
	"abilityPoints" integer not null,
	foreign key ("buildId") references "Build" ("id") on delete cascade,
	unique ("buildId", "ability")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "BuildWeaponAbility" (
	"canonicalWeaponSplId" integer not null,
	"buildId" integer not null,
	"ability" text not null,
	"abilityPoints" integer not null,
	foreign key ("buildId") references "Build" ("id") on delete cascade,
	unique ("canonicalWeaponSplId", "buildId", "ability")
	on conflict rollback
) strict;
--> statement-breakpoint
create index build_ability_sum_ability_ap on "BuildAbilitySum" ("ability", "abilityPoints");
--> statement-breakpoint
create index build_weapon_ability_weapon_ability_ap on "BuildWeaponAbility" (
	"canonicalWeaponSplId",
	"ability",
	"abilityPoints"
);
--> statement-breakpoint
create index build_abilities_signature on "Build" ("abilitiesSignature");
--> statement-breakpoint
create unique index build_weapon_canonical_unique on "BuildWeapon" ("buildId", "canonicalWeaponSplId");
--> statement-breakpoint
create index build_weapon_lookup on "BuildWeapon" (
	"canonicalWeaponSplId",
	"sortValue",
	"updatedAt" desc,
	"buildId"
);
--> statement-breakpoint
create table "ScrimMapList" (
	"id" integer primary key autoincrement,
	"scrimPostId" integer not null,
	"side" text not null check ("side" in ('ALPHA', 'BRAVO')),
	"source" text not null check ("source" in ('TOURNAMENT', 'POOL')),
	"tournamentId" integer,
	"serializedPool" text,
	"updatedAt" integer not null,
	foreign key ("scrimPostId") references "ScrimPost" ("id") on delete cascade,
	foreign key ("tournamentId") references "Tournament" ("id"),
	unique ("scrimPostId", "side")
	on conflict rollback
) strict;
--> statement-breakpoint
create table "ScrimMap" (
	"id" integer primary key autoincrement,
	"scrimPostId" integer not null,
	"index" integer not null,
	"mode" text not null,
	"stageId" integer not null,
	"winnerSide" text check ("winnerSide" in ('ALPHA', 'BRAVO')),
	"reportedAt" integer,
	"reportedByUserId" integer,
	foreign key ("scrimPostId") references "ScrimPost" ("id") on delete cascade,
	foreign key ("reportedByUserId") references "User" ("id"),
	unique ("scrimPostId", "index")
	on conflict rollback
) strict;
--> statement-breakpoint
create index scrim_map_scrim_post_id_index_idx on "ScrimMap" ("scrimPostId", "index");
--> statement-breakpoint
create table "UserWeaponPool" (
	"userId" integer not null,
	"sortOrder" integer not null,
	"weaponSplId" integer not null,
	"isFavorite" integer not null default 0,
	foreign key ("userId") references "User" ("id") on delete cascade,
	primary key ("userId", "sortOrder")
) strict;
--> statement-breakpoint
create table "TenStarWeapon" (
	"userId" integer not null,
	"weaponSplId" integer not null,
	foreign key ("userId") references "User" ("id") on delete cascade,
	primary key ("userId", "weaponSplId")
) strict;
--> statement-breakpoint
create index xrank_placement_player_power on "XRankPlacement" (
	"playerId",
	"power",
	"mode",
	"weaponSplId",
	"name"
);
--> statement-breakpoint
create index tournament_badge_owner_badge_id on "TournamentBadgeOwner" ("badgeId");
--> statement-breakpoint
create virtual table "UserSearch" using fts5 (
	"username",
	"inGameName",
	"discordUniqueName",
	"customUrl",
	content = 'User',
	content_rowid = 'id',
	tokenize = 'trigram'
);
--> statement-breakpoint
create trigger "user_search_after_insert" after insert on "User" begin
insert into
	"UserSearch" (
		rowid,
		"username",
		"inGameName",
		"discordUniqueName",
		"customUrl"
	)
values
	(
		new."id",
		new."username",
		new."inGameName",
		new."discordUniqueName",
		new."customUrl"
	);

end;
--> statement-breakpoint
create trigger "user_search_after_delete" after delete on "User" begin
insert into
	"UserSearch" (
		"UserSearch",
		rowid,
		"username",
		"inGameName",
		"discordUniqueName",
		"customUrl"
	)
values
	(
		'delete',
		old."id",
		old."username",
		old."inGameName",
		old."discordUniqueName",
		old."customUrl"
	);

end;
--> statement-breakpoint
create trigger "user_search_after_update" after
update of "customName",
"discordName",
"inGameName",
"discordUniqueName",
"customUrl" on "User" begin
insert into
	"UserSearch" (
		"UserSearch",
		rowid,
		"username",
		"inGameName",
		"discordUniqueName",
		"customUrl"
	)
values
	(
		'delete',
		old."id",
		old."username",
		old."inGameName",
		old."discordUniqueName",
		old."customUrl"
	);

insert into
	"UserSearch" (
		rowid,
		"username",
		"inGameName",
		"discordUniqueName",
		"customUrl"
	)
values
	(
		new."id",
		new."username",
		new."inGameName",
		new."discordUniqueName",
		new."customUrl"
	);

end;
--> statement-breakpoint
create table "TournamentTeamHistory" (
	"id" integer primary key autoincrement,
	"tournamentTeamId" integer not null,
	"tournamentId" integer not null,
	"name" text not null,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index tournament_team_history_tournament_id_idx on "TournamentTeamHistory" ("tournamentId");
--> statement-breakpoint
create table "ExternalStream" (
	"id" integer primary key autoincrement,
	"name" text not null,
	"url" text not null,
	"avatarImgId" integer,
	"startsAt" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage" ("id") on delete set null
) strict;
--> statement-breakpoint
create table "SplatoonPlayer" (
	"id" integer primary key,
	"userId" integer unique,
	"splId" text unique not null,
	"peakXp" text,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create index splatoon_player_user_id on "SplatoonPlayer" ("userId");
--> statement-breakpoint
create index all_team_avatar_img_id on "AllTeam" ("avatarImgId");
--> statement-breakpoint
create index all_team_banner_img_id on "AllTeam" ("bannerImgId");
--> statement-breakpoint
create index calendar_event_avatar_img_id on "CalendarEvent" ("avatarImgId");
--> statement-breakpoint
create index plus_vote_year_month on "PlusVote" ("year", "month", "votedId", "tier", "score");
--> statement-breakpoint
create index reported_weapon_tournament_created_at on "ReportedWeapon" (
	"createdAt",
	"userId",
	"weaponSplId",
	"tournamentMatchId"
)
where
	"tournamentMatchId" is not null;
--> statement-breakpoint
create index reported_weapon_group_match_user_weapon on "ReportedWeapon" ("groupMatchId", "userId", "weaponSplId");
--> statement-breakpoint
create index skill_season_identifier_leaderboard on "Skill" ("season", "identifier", "ordinal", "matchesCount");
--> statement-breakpoint
create index skill_season_user_id_leaderboard on "Skill" (
	"season",
	"userId",
	"groupMatchId",
	"ordinal",
	"matchesCount"
);
--> statement-breakpoint
create index xrank_placement_power on "XRankPlacement" ("power" desc);
--> statement-breakpoint
create index xrank_placement_mode_power on "XRankPlacement" ("mode", "power" desc);
--> statement-breakpoint
create index xrank_placement_weapon_power on "XRankPlacement" ("weaponSplId", "power" desc);
--> statement-breakpoint
create index calendar_event_result_team_event_id on "CalendarEventResultTeam" ("eventId");
--> statement-breakpoint
create index user_map_mode_preferences on "User" ("id", "mapModePreferences")
where
	"mapModePreferences" is not null;
--> statement-breakpoint
create index group_status_active on "Group" ("status")
where
	"status" != 'INACTIVE';
--> statement-breakpoint
create index art_created_at on "Art" ("createdAt" desc);
--> statement-breakpoint
create table "UserReport" (
	"id" integer primary key autoincrement,
	"reportedUserId" integer not null,
	"reporterUserId" integer not null,
	"category" text not null,
	"description" text not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	"matchId" integer references "GroupMatch" ("id") on delete set null,
	foreign key ("reportedUserId") references "User" ("id") on delete cascade,
	foreign key ("reporterUserId") references "User" ("id") on delete cascade,
	unique ("reportedUserId", "reporterUserId")
) strict;
--> statement-breakpoint
create index user_report_reported_user_id_idx on "UserReport" ("reportedUserId");
--> statement-breakpoint
create table "TournamentMatch" (
	"id" integer primary key,
	"roundId" integer not null,
	"stageId" integer not null,
	"groupId" integer not null,
	"number" integer not null,
	"opponentOne" text,
	"opponentTwo" text,
	"winnerSide" text check ("winnerSide" in ('opponent1', 'opponent2')),
	"chatCode" text,
	"startedAt" integer,
	foreign key ("roundId") references "TournamentRound" ("id") on delete cascade,
	foreign key ("stageId") references "TournamentStage" ("id") on delete cascade,
	foreign key ("groupId") references "TournamentGroup" ("id") on delete cascade,
	unique ("number", "roundId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_match_round_id on "TournamentMatch" ("roundId");
--> statement-breakpoint
create index tournament_match_stage_id on "TournamentMatch" ("stageId");
--> statement-breakpoint
create index tournament_match_group_id on "TournamentMatch" ("groupId");
--> statement-breakpoint
create index idx_tournament_match_opponent_one_id on "TournamentMatch" ("opponentOne" ->> '$.id');
--> statement-breakpoint
create index idx_tournament_match_opponent_two_id on "TournamentMatch" ("opponentTwo" ->> '$.id');
--> statement-breakpoint
create index calendar_event_date_event_id_starts_at on "CalendarEventDate" ("eventId", "startsAt" desc);
--> statement-breakpoint
create index scrim_post_starts_at on "ScrimPost" ("startsAt");
--> statement-breakpoint
create table "TournamentAuditLog" (
	"id" integer primary key autoincrement,
	"tournamentId" integer not null,
	"type" text not null,
	"actorUserId" integer not null,
	"subjectUserId" integer,
	"tournamentTeamHistoryId" integer,
	"metadata" text,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade,
	foreign key ("actorUserId") references "User" ("id"),
	foreign key ("subjectUserId") references "User" ("id"),
	foreign key ("tournamentTeamHistoryId") references "TournamentTeamHistory" ("id")
) strict;
--> statement-breakpoint
create index tournament_audit_log_tournament_id_created_at_idx on "TournamentAuditLog" ("tournamentId", "createdAt");
--> statement-breakpoint
create index tournament_audit_log_tournament_id_team_history_id_type_created_at_idx on "TournamentAuditLog" (
	"tournamentId",
	"tournamentTeamHistoryId",
	"type",
	"createdAt"
);
--> statement-breakpoint
create table "TournamentStage" (
	"id" integer primary key,
	"tournamentId" integer not null,
	"name" text not null,
	"type" text not null,
	"settings" text not null,
	"number" integer not null,
	"createdAt" integer default (strftime('%s', 'now')) not null,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade,
	unique ("number", "tournamentId")
	on conflict rollback
) strict;
--> statement-breakpoint
create index tournament_stage_tournament_id on "TournamentStage" ("tournamentId");
--> statement-breakpoint
create table "Trophy" (
	"id" integer primary key,
	"name" text not null,
	"model" text not null,
	"code" text unique,
	"organizationId" integer,
	"creatorId" integer,
	"managerId" integer,
	foreign key ("organizationId") references "TournamentOrganization" ("id") on delete set null,
	foreign key ("creatorId") references "User" ("id") on delete set null,
	foreign key ("managerId") references "User" ("id") on delete set null
) strict;
--> statement-breakpoint
create table "TrophyOwner" (
	"trophyId" integer not null,
	"userId" integer not null,
	"tournamentId" integer not null,
	"tier" integer,
	foreign key ("trophyId") references "Trophy" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	foreign key ("tournamentId") references "Tournament" ("id") on delete cascade
) strict;
--> statement-breakpoint
create unique index "trophy_owner_tournament_user_unique" on "TrophyOwner" ("tournamentId", "userId", "trophyId");
--> statement-breakpoint
create index "trophy_owner_user_id" on "TrophyOwner" ("userId");
--> statement-breakpoint
create index "trophy_owner_trophy_id" on "TrophyOwner" ("trophyId", "userId");
--> statement-breakpoint
create table "SpecialTrophyOwner" (
	"trophyId" integer not null,
	"userId" integer not null,
	"createdAt" integer not null,
	primary key ("trophyId", "userId"),
	foreign key ("trophyId") references "Trophy" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade
) strict;
--> statement-breakpoint
create table "PendingTrophy" (
	"id" integer primary key,
	"name" text not null,
	"model" text not null,
	"description" text not null,
	"organizationId" integer,
	"submitterUserId" integer not null,
	"createdAt" integer not null,
	"declineReason" text,
	"declinedAt" integer,
	"declinedByUserId" integer,
	"targetTrophyId" integer,
	"managerId" integer,
	foreign key ("organizationId") references "TournamentOrganization" ("id") on delete set null,
	foreign key ("submitterUserId") references "User" ("id") on delete cascade,
	foreign key ("declinedByUserId") references "User" ("id") on delete set null,
	foreign key ("targetTrophyId") references "Trophy" ("id") on delete cascade,
	foreign key ("managerId") references "User" ("id") on delete set null
) strict;
--> statement-breakpoint
create index "pending_trophy_submitter_idx" on "PendingTrophy" ("submitterUserId");
--> statement-breakpoint
create table "PendingTrophyApproval" (
	"pendingTrophyId" integer not null,
	"userId" integer not null,
	"createdAt" integer not null,
	foreign key ("pendingTrophyId") references "PendingTrophy" ("id") on delete cascade,
	foreign key ("userId") references "User" ("id") on delete cascade,
	unique ("pendingTrophyId", "userId")
) strict;
--> statement-breakpoint
create index "calendar_event_trophy_id" on "CalendarEvent" ("trophyId");
