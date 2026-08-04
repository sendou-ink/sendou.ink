import * as AdminRepository from "~/features/admin/AdminRepository.server";
import * as ExternalStreamRepository from "~/features/admin/ExternalStreamRepository.server";
import * as ApiRepository from "~/features/api/ApiRepository.server";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import * as LogInLinkRepository from "~/features/auth/LogInLinkRepository.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import * as ScrimMapListRepository from "~/features/scrims/ScrimMapListRepository.server";
import * as ScrimMapRepository from "~/features/scrims/ScrimMapRepository.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as QStreamsRepository from "~/features/sendouq-streams/QStreamsRepository.server";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Fixtures } from "./fixtures";

const SEARCH_QUERY = { query: "s", limit: 25 };

export interface BenchmarkCase {
	name: string;
	run: () => Promise<unknown>;
}

/**
 * Builds the full benchmark case registry from resolved fixtures. Cases whose
 * fixture resolved to null are returned in `skipped` instead.
 */
export function buildCases(fx: Fixtures): {
	cases: BenchmarkCase[];
	skipped: string[];
} {
	const cases: BenchmarkCase[] = [];
	const skipped: string[] = [];

	function add<T>(
		name: string,
		fixture: T | null,
		run: (fixture: T) => unknown,
	) {
		if (fixture === null) {
			skipped.push(name);
			return;
		}
		cases.push({ name, run: async () => run(fixture) });
	}

	function addStatic(name: string, run: () => unknown) {
		cases.push({ name, run: async () => run() });
	}

	// AdminRepository
	addStatic("AdminRepository.findAllBannedUsers", () =>
		AdminRepository.findAllBannedUsers(),
	);
	add("AdminRepository.findModNoteById", fx.modNoteId, (id) =>
		AdminRepository.findModNoteById(id),
	);

	// ExternalStreamRepository
	addStatic("ExternalStreamRepository.findAll", () =>
		ExternalStreamRepository.findAll(),
	);
	addStatic("ExternalStreamRepository.findAllForSidebar", () =>
		ExternalStreamRepository.findAllForSidebar(),
	);

	// ApiRepository
	add("ApiRepository.findTokenByUserId", fx.apiTokenUserId, (userId) =>
		ApiRepository.findTokenByUserId(userId, "read"),
	);
	addStatic("ApiRepository.findAllApiTokens", () =>
		ApiRepository.findAllApiTokens(),
	);

	// ArtRepository
	addStatic("ArtRepository.findShowcaseArts", () =>
		ArtRepository.findShowcaseArts(),
	);
	add("ArtRepository.findShowcaseArtsByTag", fx.heavyArtTagId, (tagId) =>
		ArtRepository.findShowcaseArtsByTag(tagId),
	);
	addStatic("ArtRepository.findRecentlyUploadedArts", () =>
		ArtRepository.findRecentlyUploadedArts(),
	);
	addStatic("ArtRepository.findAllTags", () => ArtRepository.findAllTags());
	add("ArtRepository.findArtsByUserId", fx.heavyArtUserId, (userId) =>
		ArtRepository.findArtsByUserId(userId),
	);

	// AssociationRepository
	add("AssociationRepository.findById", fx.heavyAssociation, (association) =>
		AssociationRepository.findById(association.id, { withMembers: true }),
	);
	add(
		"AssociationRepository.findByMemberUserId",
		fx.heavyAssociation,
		(association) =>
			AssociationRepository.findByMemberUserId(association.memberUserId, {
				withMembers: true,
			}),
	);
	add(
		"AssociationRepository.findByInviteCode",
		fx.heavyAssociation,
		(association) =>
			AssociationRepository.findByInviteCode(association.inviteCode, {
				withMembers: true,
			}),
	);
	add(
		"AssociationRepository.findInviteCodeById",
		fx.heavyAssociation,
		(association) => AssociationRepository.findInviteCodeById(association.id),
	);

	// LogInLinkRepository
	add("LogInLinkRepository.findValidByCode", fx.logInLinkCode, (code) =>
		LogInLinkRepository.findValidByCode(code),
	);

	// BadgeRepository
	addStatic("BadgeRepository.findAll", () => BadgeRepository.findAll());
	add("BadgeRepository.findById", fx.heavyBadgeId, (badgeId) =>
		BadgeRepository.findById(badgeId),
	);
	add("BadgeRepository.findByManagersList", fx.manyUserIds, (userIds) =>
		BadgeRepository.findByManagersList(userIds),
	);
	add("BadgeRepository.findManagedByUserId", fx.badgeManagerUserId, (userId) =>
		BadgeRepository.findManagedByUserId(userId),
	);
	add("BadgeRepository.findByOwnerUserId", fx.badgeOwnerUserId, (userId) =>
		BadgeRepository.findByOwnerUserId(userId),
	);
	add("BadgeRepository.findByAuthorUserId", fx.badgeAuthorId, (userId) =>
		BadgeRepository.findByAuthorUserId(userId),
	);

	// BuildRepository
	add("BuildRepository.findAllByUserId", fx.heavyBuildUserId, (userId) =>
		BuildRepository.findAllByUserId(userId, {
			showPrivate: true,
			sortAbilities: true,
		}),
	);
	add("BuildRepository.findOwnerIdById", fx.buildId, (buildId) =>
		BuildRepository.findOwnerIdById(buildId),
	);
	addStatic("BuildRepository.findAllAbilityPointAverages.all", () =>
		BuildRepository.findAllAbilityPointAverages(),
	);
	add(
		"BuildRepository.findAllAbilityPointAverages.byWeapon",
		fx.heavyWeaponSplId,
		(weaponSplId) => BuildRepository.findAllAbilityPointAverages(weaponSplId),
	);
	add(
		"BuildRepository.findAllPopularAbilitiesByWeaponId",
		fx.heavyWeaponSplId,
		(weaponSplId) =>
			BuildRepository.findAllPopularAbilitiesByWeaponId(weaponSplId),
	);
	add("BuildRepository.findAllByWeaponId", fx.heavyWeaponSplId, (weaponSplId) =>
		BuildRepository.findAllByWeaponId(weaponSplId, {
			limit: 60,
			sortAbilities: true,
		}),
	);

	// CalendarRepository
	add(
		"CalendarRepository.findAllBetweenTwoTimestamps",
		fx.calendarWindow,
		(window) => CalendarRepository.findAllBetweenTwoTimestamps(window),
	);
	add("CalendarRepository.findById", fx.heavyCalendarEventId, (eventId) =>
		CalendarRepository.findById(eventId, {
			includeMapPool: true,
			includeTieBreakerMapPool: true,
			includeBadgePrizes: true,
		}),
	);
	add(
		"CalendarRepository.findRecentTournamentsByAuthorId",
		fx.calendarAuthorId,
		(authorId) => CalendarRepository.findRecentTournamentsByAuthorId(authorId),
	);
	add("CalendarRepository.findResultsByEventId", fx.resultsEventId, (eventId) =>
		CalendarRepository.findResultsByEventId(eventId),
	);

	// FriendRepository
	add("FriendRepository.findByUserIdWithActivity", fx.heavyFriendPair, (pair) =>
		FriendRepository.findByUserIdWithActivity(pair.userId),
	);
	add("FriendRepository.findPendingSentRequests", fx.heavyFriendPair, (pair) =>
		FriendRepository.findPendingSentRequests(pair.userId),
	);
	add(
		"FriendRepository.findPendingReceivedRequests",
		fx.heavyFriendPair,
		(pair) => FriendRepository.findPendingReceivedRequests(pair.userId),
	);
	add(
		"FriendRepository.findPendingReceivedRequestIds",
		fx.heavyFriendPair,
		(pair) => FriendRepository.findPendingReceivedRequestIds(pair.userId),
	);
	add("FriendRepository.countPendingSentRequests", fx.heavyFriendPair, (pair) =>
		FriendRepository.countPendingSentRequests(pair.userId),
	);
	add("FriendRepository.findFriendsByUserId", fx.heavyFriendPair, (pair) =>
		FriendRepository.findFriendsByUserId(pair.userId),
	);
	add("FriendRepository.findFriendIds", fx.heavyFriendPair, (pair) =>
		FriendRepository.findFriendIds(pair.userId),
	);
	add("FriendRepository.findFriendRequestBetween", fx.heavyFriendPair, (pair) =>
		FriendRepository.findFriendRequestBetween({
			senderId: pair.userId,
			receiverId: pair.otherUserId,
		}),
	);
	add("FriendRepository.findMutualFriends", fx.heavyFriendPair, (pair) =>
		FriendRepository.findMutualFriends({
			loggedInUserId: pair.userId,
			targetUserId: pair.otherUserId,
		}),
	);
	add("FriendRepository.findFriendship", fx.heavyFriendPair, (pair) =>
		FriendRepository.findFriendship({
			userOneId: pair.userId,
			userTwoId: pair.otherUserId,
		}),
	);
	add(
		"FriendRepository.findFriendRequestByIdAndReceiver",
		fx.friendRequest,
		(request) => FriendRepository.findFriendRequestByIdAndReceiver(request),
	);

	// ImageRepository
	add("ImageRepository.findById", fx.imageId, (imageId) =>
		ImageRepository.findById(imageId),
	);
	add("ImageRepository.countUnvalidatedArt", fx.heavyArtUserId, (userId) =>
		ImageRepository.countUnvalidatedArt(userId),
	);
	addStatic("ImageRepository.countAllUnvalidated", () =>
		ImageRepository.countAllUnvalidated(),
	);
	addStatic("ImageRepository.findAllUnvalidated", () =>
		ImageRepository.findAllUnvalidated(),
	);
	add(
		"ImageRepository.countUnvalidatedBySubmitterUserId",
		fx.imageSubmitterId,
		(userId) => ImageRepository.countUnvalidatedBySubmitterUserId(userId),
	);

	// LeaderboardRepository
	add("LeaderboardRepository.findTeamLeaderboardBySeason", fx.sq, (sq) =>
		LeaderboardRepository.findTeamLeaderboardBySeason({
			season: sq.season,
			onlyOneEntryPerUser: true,
		}),
	);
	add("LeaderboardRepository.hasEnoughSqMatchesByUserId", fx.sq, (sq) =>
		LeaderboardRepository.hasEnoughSqMatchesByUserId(sq.userId),
	);
	add("LeaderboardRepository.findSeasonsParticipatedInByUserId", fx.sq, (sq) =>
		LeaderboardRepository.findSeasonsParticipatedInByUserId(sq.userId),
	);
	addStatic("LeaderboardRepository.findAllXPLeaderboard", () =>
		LeaderboardRepository.findAllXPLeaderboard(),
	);
	addStatic("LeaderboardRepository.findModeXPLeaderboard", () =>
		LeaderboardRepository.findModeXPLeaderboard("SZ"),
	);
	add(
		"LeaderboardRepository.findWeaponXPLeaderboard",
		fx.heavyWeaponSplId,
		(weaponSplId) => LeaderboardRepository.findWeaponXPLeaderboard(weaponSplId),
	);
	add("LeaderboardRepository.findUserSPLeaderboard", fx.sq, (sq) =>
		LeaderboardRepository.findUserSPLeaderboard(sq.season),
	);
	add("LeaderboardRepository.findSeasonPopularUsersWeapon", fx.sq, (sq) =>
		LeaderboardRepository.findSeasonPopularUsersWeapon(sq.season),
	);

	// LFGRepository
	addStatic("LFGRepository.findAllPosts.anon", () =>
		LFGRepository.findAllPosts(),
	);
	add("LFGRepository.findAllPosts.loggedIn", fx.heavyUser, (user) =>
		LFGRepository.findAllPosts({ id: user.id, plusTier: 1 }),
	);
	add("LFGRepository.findByAuthorUserId", fx.lfgAuthorId, (authorId) =>
		LFGRepository.findByAuthorUserId(authorId),
	);

	// LiveStreamRepository
	addStatic("LiveStreamRepository.findXRankStreams", () =>
		LiveStreamRepository.findXRankStreams(),
	);

	// MatchProfileRepository
	add("MatchProfileRepository.findSettingsByUserId", fx.heavyUser, (user) =>
		MatchProfileRepository.findSettingsByUserId(user.id),
	);

	// SkillRepository (app/features/mmr)
	add("SkillRepository.findCurrentUserSkills", fx.skillBatch, (skillBatch) =>
		SkillRepository.findCurrentUserSkills({
			season: skillBatch.season,
			userIds: skillBatch.userIds,
		}),
	);
	add("SkillRepository.findCurrentTeamSkills", fx.skillBatch, (skillBatch) =>
		SkillRepository.findCurrentTeamSkills({
			season: skillBatch.season,
			identifiers: skillBatch.identifiers,
		}),
	);
	add(
		"SkillRepository.findOrderedUserOrdinalsBySeason",
		fx.skillBatch,
		(skillBatch) =>
			SkillRepository.findOrderedUserOrdinalsBySeason(skillBatch.season),
	);
	add("SkillRepository.existsBySeason", fx.skillBatch, (skillBatch) =>
		SkillRepository.existsBySeason(skillBatch.season),
	);
	add("SkillRepository.findSeedingSkills", fx.skillBatch, (skillBatch) =>
		SkillRepository.findSeedingSkills({
			type: "RANKED",
			userIds: skillBatch.userIds,
		}),
	);
	add("SkillRepository.findSeasonProgressionByUserId", fx.sq, (sq) =>
		SkillRepository.findSeasonProgressionByUserId(sq),
	);
	add("SkillRepository.findSeasonActiveDaysByUserId", fx.sq, (sq) =>
		SkillRepository.findSeasonActiveDaysByUserId(sq),
	);

	// NotificationRepository
	add("NotificationRepository.findByUserId", fx.notification, (notification) =>
		NotificationRepository.findByUserId(notification.userId, { limit: 50 }),
	);
	add("NotificationRepository.findAllByType", fx.notification, (notification) =>
		NotificationRepository.findAllByType(notification.type),
	);
	add(
		"NotificationRepository.findAllSubscriptionsByUserIds",
		fx.manyUserIds,
		(userIds) => NotificationRepository.findAllSubscriptionsByUserIds(userIds),
	);

	// PlusSuggestionRepository
	add(
		"PlusSuggestionRepository.findAllByMonth",
		fx.plusSuggestionMonthYear,
		(monthYear) => PlusSuggestionRepository.findAllByMonth(monthYear),
	);

	// PlusVotingRepository
	addStatic("PlusVotingRepository.findAllPlusTiersFromLatestVoting", () =>
		PlusVotingRepository.findAllPlusTiersFromLatestVoting(),
	);
	add("PlusVotingRepository.findResultsByMonthYear", fx.plusVoting, (voting) =>
		PlusVotingRepository.findResultsByMonthYear(voting),
	);
	add(
		"PlusVotingRepository.findAllUsersForVoting",
		fx.plusTierOneUser,
		(user) => PlusVotingRepository.findAllUsersForVoting(user),
	);
	add("PlusVotingRepository.hasVoted", fx.plusVoting, (voting) =>
		PlusVotingRepository.hasVoted({
			authorId: voting.voterId,
			month: voting.month,
			year: voting.year,
		}),
	);

	// ScrimMapListRepository
	add(
		"ScrimMapListRepository.findMapListsByScrimPostId",
		fx.heavyScrimPostId,
		(scrimPostId) =>
			ScrimMapListRepository.findMapListsByScrimPostId(scrimPostId),
	);

	// ScrimMapRepository
	add(
		"ScrimMapRepository.findMapsByScrimPostId",
		fx.heavyScrimPostId,
		(scrimPostId) => ScrimMapRepository.findMapsByScrimPostId(scrimPostId),
	);

	// ScrimPostRepository
	add("ScrimPostRepository.findById", fx.heavyScrimPostId, (scrimPostId) =>
		ScrimPostRepository.findById(scrimPostId),
	);
	addStatic("ScrimPostRepository.findAllRelevant", () =>
		ScrimPostRepository.findAllRelevant(),
	);
	add(
		"ScrimPostRepository.findAcceptedScrimsBetweenTwoTimestamps",
		fx.scrimWindow,
		(window) =>
			ScrimPostRepository.findAcceptedScrimsBetweenTwoTimestamps({
				startTime: window.startTime,
				endTime: window.endTime,
				excludeRecentlyCreated: window.endTime,
			}),
	);
	add(
		"ScrimPostRepository.findPendingOverlapsForUsers",
		both(fx.scrimUserIds, fx.scrimWindow),
		([userIds, window]) =>
			ScrimPostRepository.findPendingOverlapsForUsers({
				userIds,
				startTime: dateToDatabaseTimestamp(window.startTime),
				endTime: dateToDatabaseTimestamp(window.endTime),
				excludePostId: -1,
			}),
	);
	add("ScrimPostRepository.findUserScrims", fx.scrimUserIds, (userIds) =>
		ScrimPostRepository.findUserScrims(userIds[0]),
	);

	// GroupMatchContinueVoteRepository
	add(
		"GroupMatchContinueVoteRepository.findAllByGroupIds",
		fx.heavyGroupIds,
		(groupIds) => GroupMatchContinueVoteRepository.findAllByGroupIds(groupIds),
	);

	// PlayerStatRepository
	add("PlayerStatRepository.findSeasonMapWinrateByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonMapWinrateByUserId(sq),
	);
	add("PlayerStatRepository.findSeasonSetWinrateByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonSetWinrateByUserId(sq),
	);
	add("PlayerStatRepository.findSeasonStagesByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonStagesByUserId(sq),
	);
	add("PlayerStatRepository.findSeasonMatesEnemiesByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			...sq,
			type: "MATE",
		}),
	);
	add("PlayerStatRepository.findSeasonSetScoresByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonSetScoresByUserId(sq),
	);
	add("PlayerStatRepository.findSeasonBestSetsByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonBestSetsByUserId({ ...sq, limit: 3 }),
	);
	add("PlayerStatRepository.findSeasonTournamentRunsByUserId", fx.sq, (sq) =>
		PlayerStatRepository.findSeasonTournamentRunsByUserId(sq),
	);

	// ReportedWeaponRepository
	add(
		"ReportedWeaponRepository.findByMatchId",
		fx.heavyGroupMatchId,
		(matchId) => ReportedWeaponRepository.findByMatchId(matchId),
	);
	add(
		"ReportedWeaponRepository.findByTournamentMatchId",
		fx.heavyTournamentMatchId,
		(matchId) => ReportedWeaponRepository.findByTournamentMatchId(matchId),
	);
	add(
		"ReportedWeaponRepository.findSeasonReportedWeaponsByUserId",
		fx.sq,
		(sq) => ReportedWeaponRepository.findSeasonReportedWeaponsByUserId(sq),
	);
	add(
		"ReportedWeaponRepository.findAllWeaponUsageStats",
		both(fx.sq, fx.heavyStageModeCombo),
		([sq, combo]) =>
			ReportedWeaponRepository.findAllWeaponUsageStats({
				userId: sq.userId,
				season: sq.season,
				mode: combo.mode,
				stageId: combo.stageId,
			}),
	);

	// SQMatchRepository
	add("SQMatchRepository.findById", fx.heavyGroupMatchId, (matchId) =>
		SQMatchRepository.findById(matchId),
	);
	add("SQMatchRepository.countSeasonResultPagesByUserId", fx.sq, (sq) =>
		SQMatchRepository.countSeasonResultPagesByUserId(sq),
	);
	add("SQMatchRepository.findSeasonResultsByUserId", fx.sq, (sq) =>
		SQMatchRepository.findSeasonResultsByUserId({ ...sq, page: 1 }),
	);
	add("SQMatchRepository.findSeasonCanceledMatchesByUserId", fx.sq, (sq) =>
		SQMatchRepository.findSeasonCanceledMatchesByUserId(sq),
	);
	add(
		"SQMatchRepository.findCancelReportsByGroupMatchId",
		fx.heavyGroupMatchId,
		(matchId) => SQMatchRepository.findCancelReportsByGroupMatchId(matchId),
	);
	add(
		"SQMatchRepository.findCancelNominationCountsByUserIds",
		both(fx.manyUserIds, fx.sq),
		([userIds, sq]) =>
			SQMatchRepository.findCancelNominationCountsByUserIds({
				userIds,
				season: sq.season,
			}),
	);

	// QStreamsRepository
	addStatic("QStreamsRepository.findAllActiveMatchPlayers", () =>
		QStreamsRepository.findAllActiveMatchPlayers(),
	);

	// PrivateUserNoteRepository (relies on the benchmark's actor context)
	addStatic("PrivateUserNoteRepository.findAllOwn.all", () =>
		PrivateUserNoteRepository.findAllOwn(),
	);
	add(
		"PrivateUserNoteRepository.findAllOwn.byTargets",
		fx.manyUserIds,
		(userIds) => PrivateUserNoteRepository.findAllOwn(userIds),
	);

	// SQGroupRepository
	add(
		"SQGroupRepository.findMapModePreferencesByGroupId",
		fx.heavyGroupIds,
		(groupIds) =>
			SQGroupRepository.findMapModePreferencesByGroupId(groupIds[0]),
	);
	addStatic("SQGroupRepository.findCurrentGroups", () =>
		SQGroupRepository.findCurrentGroups(),
	);
	addStatic("SQGroupRepository.findActiveGroupMembers", () =>
		SQGroupRepository.findActiveGroupMembers(),
	);
	add("SQGroupRepository.findAllLikesByGroupId", fx.heavyGroupIds, (groupIds) =>
		SQGroupRepository.findAllLikesByGroupId(groupIds[0]),
	);
	add("SQGroupRepository.findFriendsAndTeammates", fx.sq, (sq) =>
		SQGroupRepository.findFriendsAndTeammates(sq.userId),
	);
	add("SQGroupRepository.findAllMapModePreferencesBySeasonNth", fx.sq, (sq) =>
		SQGroupRepository.findAllMapModePreferencesBySeasonNth(sq.season),
	);
	addStatic("SQGroupRepository.findRecentlyFinishedMatches", () =>
		SQGroupRepository.findRecentlyFinishedMatches(),
	);

	// SplatoonRotationRepository
	addStatic("SplatoonRotationRepository.findAll", () =>
		SplatoonRotationRepository.findAll(),
	);

	// TeamRepository
	addStatic("TeamRepository.findAllUndisbanded", () =>
		TeamRepository.findAllUndisbanded(),
	);
	addStatic("TeamRepository.searchByName", () =>
		TeamRepository.searchByName(SEARCH_QUERY),
	);
	add("TeamRepository.findById", fx.heavyTeam, (team) =>
		TeamRepository.findById(team.id),
	);
	add("TeamRepository.findAllMemberOfByUserId", fx.heavyTeam, (team) =>
		TeamRepository.findAllMemberOfByUserId(team.memberUserId),
	);
	add("TeamRepository.findByCustomUrl", fx.heavyTeam, (team) =>
		TeamRepository.findByCustomUrl(team.customUrl, {
			includeInviteCode: true,
		}),
	);
	add("TeamRepository.findResultPlacementsById", fx.heavyTeam, (team) =>
		TeamRepository.findResultPlacementsById(team.id),
	);
	add("TeamRepository.findResultsById", fx.heavyTeam, (team) =>
		TeamRepository.findResultsById(team.id),
	);
	add("TeamRepository.findAllByMemberUserId", fx.heavyTeam, (team) =>
		TeamRepository.findAllByMemberUserId(team.memberUserId),
	);

	// XRankPlacementRepository
	add("XRankPlacementRepository.isPlayerLinkedByUserId", fx.xrank, (xrank) =>
		XRankPlacementRepository.isPlayerLinkedByUserId(xrank.userId),
	);
	add(
		"XRankPlacementRepository.findPeakVerifiedXpByUserId",
		fx.xrank,
		(xrank) =>
			XRankPlacementRepository.findPeakVerifiedXpByUserId(xrank.userId),
	);
	add("XRankPlacementRepository.findPlacementsOfMonth", fx.xrank, (xrank) =>
		XRankPlacementRepository.findPlacementsOfMonth({
			mode: xrank.mode,
			region: xrank.region,
			month: xrank.month,
			year: xrank.year,
		}),
	);
	add("XRankPlacementRepository.findPlacementsByPlayerId", fx.xrank, (xrank) =>
		XRankPlacementRepository.findPlacementsByPlayerId(xrank.playerId),
	);
	add("XRankPlacementRepository.findPlacementsByUserId", fx.xrank, (xrank) =>
		XRankPlacementRepository.findPlacementsByUserId(xrank.userId),
	);
	addStatic("XRankPlacementRepository.findAllMonthYears", () =>
		XRankPlacementRepository.findAllMonthYears(),
	);
	add("XRankPlacementRepository.findPeaksByUserId", fx.xrank, (xrank) =>
		XRankPlacementRepository.findPeaksByUserId(xrank.userId, "both"),
	);

	// BracketRepository
	add(
		"BracketRepository.findByTournamentId",
		fx.heaviestBracketTournamentId,
		(tournamentId) => BracketRepository.findByTournamentId(tournamentId),
	);

	// TournamentMatchVodRepository
	add(
		"TournamentMatchVodRepository.findVodsByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchVodRepository.findVodsByTournamentId(tournamentId),
	);
	addStatic("TournamentMatchVodRepository.findTournamentsNeedingVodSync", () =>
		TournamentMatchVodRepository.findTournamentsNeedingVodSync(),
	);
	add(
		"TournamentMatchVodRepository.findStreamersByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchVodRepository.findStreamersByTournamentId(tournamentId),
	);
	add(
		"TournamentMatchVodRepository.findMatchesWithStartedAt",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchVodRepository.findMatchesWithStartedAt(tournamentId),
	);
	add(
		"TournamentMatchVodRepository.findCastedMatchHistoryByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchVodRepository.findCastedMatchHistoryByTournamentId(
				tournamentId,
			),
	);

	// TournamentLFGRepository
	add(
		"TournamentLFGRepository.findLookingTeamsByTournamentId",
		fx.lfgTournament,
		(lfg) =>
			TournamentLFGRepository.findLookingTeamsByTournamentId(lfg.tournamentId),
	);
	add("TournamentLFGRepository.findSubGroups", fx.lfgTournament, (lfg) =>
		TournamentLFGRepository.findSubGroups(lfg.tournamentId),
	);
	add("TournamentLFGRepository.findAllLikesByTeamId", fx.lfgTournament, (lfg) =>
		TournamentLFGRepository.findAllLikesByTeamId(lfg.teamId),
	);
	add(
		"TournamentLFGRepository.findAllSubsByTournamentId",
		fx.lfgTournament,
		(lfg) =>
			TournamentLFGRepository.findAllSubsByTournamentId(lfg.tournamentId),
	);

	// TournamentMatchRepository
	add(
		"TournamentMatchRepository.findMatchById",
		fx.heavyTournamentMatchId,
		(matchId) => TournamentMatchRepository.findMatchById(matchId),
	);
	add(
		"TournamentMatchRepository.findResultById",
		fx.tournamentMatchGameResultId,
		(resultId) => TournamentMatchRepository.findResultById(resultId),
	);
	add(
		"TournamentMatchRepository.findResultsByMatchId",
		fx.heavyTournamentMatchId,
		(matchId) => TournamentMatchRepository.findResultsByMatchId(matchId),
	);
	add(
		"TournamentMatchRepository.findAllResultsByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchRepository.findAllResultsByTournamentId(tournamentId),
	);
	add(
		"TournamentMatchRepository.findUserParticipationByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentMatchRepository.findUserParticipationByTournamentId(
				tournamentId,
			),
	);
	add(
		"TournamentMatchRepository.findByTournamentTeamId",
		fx.heavyTournamentTeamId,
		(tournamentTeamId) =>
			TournamentMatchRepository.findByTournamentTeamId(tournamentTeamId),
	);

	// TournamentOrganizationRepository
	add("TournamentOrganizationRepository.findBySlug", fx.heavyOrg, (org) =>
		TournamentOrganizationRepository.findBySlug(org.slug),
	);
	add("TournamentOrganizationRepository.findByUserId", fx.heavyOrg, (org) =>
		TournamentOrganizationRepository.findByUserId(org.memberUserId),
	);
	addStatic("TournamentOrganizationRepository.searchByName", () =>
		TournamentOrganizationRepository.searchByName(SEARCH_QUERY),
	);
	add(
		"TournamentOrganizationRepository.findEventsByMonth",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.findEventsByMonth({
				month: org.eventMonth,
				year: org.eventYear,
				organizationId: org.id,
			}),
	);
	add(
		"TournamentOrganizationRepository.findAllUnfinalizedEvents",
		fx.heavyOrg,
		(org) => TournamentOrganizationRepository.findAllUnfinalizedEvents(org.id),
	);
	add(
		"TournamentOrganizationRepository.findPaginatedEventsBySeries",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.findPaginatedEventsBySeries({
				organizationId: org.id,
				substringMatches: [org.seriesSubstring],
				page: 1,
			}),
	);
	add(
		"TournamentOrganizationRepository.findAllEventsBySeries",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.findAllEventsBySeries({
				organizationId: org.id,
				substringMatches: [org.seriesSubstring],
			}),
	);
	add(
		"TournamentOrganizationRepository.countActiveParticipants",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.countActiveParticipants({
				organizationId: org.id,
				startTime: org.windowStart,
				endTime: org.windowEnd,
			}),
	);
	add(
		"TournamentOrganizationRepository.findAllBannedUsersByOrganizationId",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.findAllBannedUsersByOrganizationId(
				org.id,
			),
	);
	add(
		"TournamentOrganizationRepository.isUserBannedByOrganization",
		both(fx.heavyOrg, fx.heavyUser),
		([org, user]) =>
			TournamentOrganizationRepository.isUserBannedByOrganization({
				organizationId: org.id,
				userId: user.id,
			}),
	);
	add(
		"TournamentOrganizationRepository.countOrganizationsByUserId",
		fx.heavyOrg,
		(org) =>
			TournamentOrganizationRepository.countOrganizationsByUserId(
				org.memberUserId,
			),
	);
	addStatic(
		"TournamentOrganizationRepository.findAllSeriesWithTierHistory",
		() => TournamentOrganizationRepository.findAllSeriesWithTierHistory(),
	);

	// SavedCalendarEventRepository
	add(
		"SavedCalendarEventRepository.isSaved",
		both(fx.heavyUser, fx.heavyTournamentId),
		([user, tournamentId]) =>
			SavedCalendarEventRepository.isSaved({
				userId: user.id,
				tournamentId,
			}),
	);
	add("SavedCalendarEventRepository.countByUserId", fx.heavyUser, (user) =>
		SavedCalendarEventRepository.countByUserId(user.id),
	);
	add(
		"SavedCalendarEventRepository.findAllUpcomingByUserId",
		fx.heavyUser,
		(user) => SavedCalendarEventRepository.findAllUpcomingByUserId(user.id),
	);

	// TournamentAuditLogRepository
	add(
		"TournamentAuditLogRepository.findByTournamentId",
		fx.auditTournamentId,
		(tournamentId) =>
			TournamentAuditLogRepository.findByTournamentId({
				tournamentId,
				limit: TournamentAuditLogRepository.AUDIT_LOG_PAGE_SIZE,
				offset: 0,
			}),
	);
	add(
		"TournamentAuditLogRepository.countByTournamentId",
		fx.auditTournamentId,
		(tournamentId) =>
			TournamentAuditLogRepository.countByTournamentId({ tournamentId }),
	);
	add(
		"TournamentAuditLogRepository.findTeamsByTournamentId",
		fx.auditTournamentId,
		(tournamentId) =>
			TournamentAuditLogRepository.findTeamsByTournamentId(tournamentId),
	);

	// TournamentRepository
	add("TournamentRepository.findById", fx.heavyTournamentId, (tournamentId) =>
		TournamentRepository.findById(tournamentId),
	);
	add(
		"TournamentRepository.findStreamsByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findStreamsByTournamentId(tournamentId),
	);
	add(
		"TournamentRepository.findTeamsFullByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findTeamsFullByTournamentId(tournamentId),
	);
	add(
		"TournamentRepository.findParticipatedUserIdsById",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findParticipatedUserIdsById(tournamentId),
	);
	add(
		"TournamentRepository.findRulesById",
		fx.heavyTournamentId,
		(tournamentId) => TournamentRepository.findRulesById(tournamentId),
	);
	add(
		"TournamentRepository.findDescriptionById",
		fx.heavyTournamentId,
		(tournamentId) => TournamentRepository.findDescriptionById(tournamentId),
	);
	add(
		"TournamentRepository.findSeedingSnapshotById",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findSeedingSnapshotById(tournamentId),
	);
	add(
		"TournamentRepository.hasChildTournaments",
		fx.parentTournamentId,
		(parentTournamentId) =>
			TournamentRepository.hasChildTournaments(parentTournamentId),
	);
	add(
		"TournamentRepository.findChildTournaments",
		fx.parentTournamentId,
		(parentTournamentId) =>
			TournamentRepository.findChildTournaments(parentTournamentId),
	);
	add(
		"TournamentRepository.findChildTournamentsForDivCalc",
		fx.parentTournamentId,
		(parentTournamentId) =>
			TournamentRepository.findChildTournamentsForDivCalc(parentTournamentId),
	);
	add(
		"TournamentRepository.findResultsByTournamentId",
		fx.heavyResultsTournamentId,
		(tournamentId) =>
			TournamentRepository.findResultsByTournamentId(tournamentId),
	);
	add(
		"TournamentRepository.findLeagueDivParticipantUserIds",
		fx.parentTournamentId,
		(parentTournamentId) =>
			TournamentRepository.findLeagueDivParticipantUserIds(parentTournamentId),
	);
	add(
		"TournamentRepository.findTOSetMapPoolById",
		fx.heavyTournamentId,
		(tournamentId) => TournamentRepository.findTOSetMapPoolById(tournamentId),
	);
	add(
		"TournamentRepository.findPreparedMapsById",
		fx.heavyTournamentId,
		(tournamentId) => TournamentRepository.findPreparedMapsById(tournamentId),
	);
	add(
		"TournamentRepository.findRelatedUsersByTournamentIds",
		fx.recentTournamentIds,
		(tournamentIds) =>
			TournamentRepository.findRelatedUsersByTournamentIds(tournamentIds),
	);
	add(
		"TournamentRepository.findParticipantTwitchAccounts",
		fx.recentTournamentIds,
		(tournamentIds) =>
			TournamentRepository.findParticipantTwitchAccounts(tournamentIds),
	);
	addStatic("TournamentRepository.findAllForShowcase", () =>
		TournamentRepository.findAllForShowcase(),
	);
	add(
		"TournamentRepository.findAllBetweenTwoTimestamps",
		fx.calendarWindow,
		(window) => TournamentRepository.findAllBetweenTwoTimestamps(window),
	);
	add(
		"TournamentRepository.findTopThreeResultsByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findTopThreeResultsByTournamentId(tournamentId),
	);
	add(
		"TournamentRepository.findFriendCodesByTournamentId",
		fx.heavyTournamentId,
		(tournamentId) =>
			TournamentRepository.findFriendCodesByTournamentId(tournamentId),
	);
	add(
		"TournamentRepository.findPickBanEventsByMatchId",
		fx.heavyTournamentMatchId,
		(matchId) => TournamentRepository.findPickBanEventsByMatchId(matchId),
	);
	addStatic("TournamentRepository.searchByName", () =>
		TournamentRepository.searchByName(SEARCH_QUERY),
	);
	addStatic("TournamentRepository.findRunningTournamentIds", () =>
		TournamentRepository.findRunningTournamentIds(),
	);

	// TournamentTeamRepository
	add(
		"TournamentTeamRepository.findByInviteCode",
		fx.tournamentTeamInviteCode,
		(inviteCode) => TournamentTeamRepository.findByInviteCode(inviteCode),
	);
	add(
		"TournamentTeamRepository.findRecentlyPlayedMapsByIds",
		fx.tournamentTeamPair,
		(teamIds) =>
			TournamentTeamRepository.findRecentlyPlayedMapsByIds({ teamIds }),
	);
	add(
		"TournamentTeamRepository.findMapPoolsByTeamIds",
		fx.tournamentTeamPair,
		(teamIds) => TournamentTeamRepository.findMapPoolsByTeamIds(teamIds),
	);

	// TrophyRepository
	addStatic("TrophyRepository.all", () => TrophyRepository.all());
	add("TrophyRepository.findById", fx.trophy, (trophy) =>
		TrophyRepository.findById(trophy.heavyTrophyId),
	);
	add("TrophyRepository.findByOwnerUserId", fx.trophy, (trophy) =>
		TrophyRepository.findByOwnerUserId(trophy.ownerUserId),
	);
	add("TrophyRepository.findTournamentsByTrophyId", fx.trophy, (trophy) =>
		TrophyRepository.findTournamentsByTrophyId(trophy.heavyTrophyId),
	);
	add("TrophyRepository.findWinsByOwner", fx.trophy, (trophy) =>
		TrophyRepository.findWinsByOwner(trophy.wins),
	);

	// UserCardRepository
	add("UserCardRepository.findAllByUserIds", fx.manyUserIds, (userIds) =>
		UserCardRepository.findAllByUserIds({
			userIds,
			include: { friendCode: true },
			includeHiddenStats: true,
		}),
	);
	add("UserCardRepository.findCardEditExtrasByUserId", fx.heavyUser, (user) =>
		UserCardRepository.findCardEditExtrasByUserId(user.id),
	);

	// UserRepository
	add("UserRepository.findIdByIdentifier", fx.heavyUser, (user) =>
		UserRepository.findIdByIdentifier(user.identifier),
	);
	add("UserRepository.findCountriesByUserIds", fx.skillBatch, (skillBatch) =>
		UserRepository.findCountriesByUserIds(skillBatch.userIds),
	);
	add("UserRepository.findPlusTiersByUserIds", fx.skillBatch, (skillBatch) =>
		UserRepository.findPlusTiersByUserIds(skillBatch.userIds),
	);
	add("UserRepository.findBuildFieldsByIdentifier", fx.heavyUser, (user) =>
		UserRepository.findBuildFieldsByIdentifier(user.identifier),
	);
	add("UserRepository.findLayoutDataByIdentifier", fx.heavyUser, (user) =>
		UserRepository.findLayoutDataByIdentifier(user.identifier, user.id),
	);
	add("UserRepository.findProfileByIdentifier", fx.heavyUser, (user) =>
		UserRepository.findProfileByIdentifier(user.identifier),
	);
	add("UserRepository.findOwnedBadgesByUserId", fx.badgeOwnerUserId, (userId) =>
		UserRepository.findOwnedBadgesByUserId(userId),
	);
	add("UserRepository.findEnabledWidgetsByIdentifier", fx.heavyUser, (user) =>
		UserRepository.findEnabledWidgetsByIdentifier(user.identifier),
	);
	add("UserRepository.findPreferencesByUserId", fx.heavyUser, (user) =>
		UserRepository.findPreferencesByUserId(user.id),
	);
	add("UserRepository.findStoredWidgetsByUserId", fx.heavyUser, (user) =>
		UserRepository.findStoredWidgetsByUserId(user.id),
	);
	add("UserRepository.findWidgetsByUserId", fx.heavyUser, (user) =>
		UserRepository.findWidgetsByUserId(user.identifier),
	);
	add("UserRepository.findByCustomUrl", fx.userCustomUrl, (customUrl) =>
		UserRepository.findByCustomUrl(customUrl),
	);
	add("UserRepository.findByFriendCode", fx.friendCode, (friendCode) =>
		UserRepository.findByFriendCode(friendCode),
	);
	add("UserRepository.findLeanById", fx.heavyUser, (user) =>
		UserRepository.findLeanById(user.id),
	);
	add("UserRepository.findModInfoById", fx.heavyUser, (user) =>
		UserRepository.findModInfoById(user.id),
	);
	addStatic("UserRepository.findAllPatrons", () =>
		UserRepository.findAllPatrons(),
	);
	addStatic("UserRepository.findAllPlusServerMembers", () =>
		UserRepository.findAllPlusServerMembers(),
	);
	add("UserRepository.findChatUsersByUserIds", fx.manyUserIds, (userIds) =>
		UserRepository.findChatUsersByUserIds(userIds),
	);
	add("UserRepository.findResultsByUserId", fx.heavyUser, (user) =>
		UserRepository.findResultsByUserId(user.id, {}),
	);
	add("UserRepository.countResultsByUserId", fx.heavyUser, (user) =>
		UserRepository.countResultsByUserId(user.id),
	);
	add("UserRepository.hasHighlightedResultsByUserId", fx.heavyUser, (user) =>
		UserRepository.hasHighlightedResultsByUserId(user.id),
	);
	add("UserRepository.findResultPlacementsByUserId", fx.heavyUser, (user) =>
		UserRepository.findResultPlacementsByUserId(user.id),
	);
	addStatic("UserRepository.search", () => UserRepository.search(SEARCH_QUERY));
	add("UserRepository.searchExact", fx.userCustomUrl, (customUrl) =>
		UserRepository.searchExact({ customUrl }),
	);
	add("UserRepository.findCurrentFriendCodeByUserId", fx.heavyUser, (user) =>
		UserRepository.findCurrentFriendCodeByUserId(user.id),
	);
	add("UserRepository.findFriendCodesByUserId", fx.heavyUser, (user) =>
		UserRepository.findFriendCodesByUserId(user.id),
	);
	addStatic("UserRepository.findAllCurrentFriendCodes", () =>
		UserRepository.findAllCurrentFriendCodes(),
	);
	add("UserRepository.findInGameNameByUserId", fx.heavyUser, (user) =>
		UserRepository.findInGameNameByUserId(user.id),
	);
	add("UserRepository.findPatronStartedAtByUserId", fx.heavyUser, (user) =>
		UserRepository.findPatronStartedAtByUserId(user.id),
	);
	add("UserRepository.findJoinOrderByUserId", fx.heavyUser, (user) =>
		UserRepository.findJoinOrderByUserId(user.id),
	);
	add("UserRepository.findCommissionsByUserId", fx.heavyUser, (user) =>
		UserRepository.findCommissionsByUserId(user.id),
	);
	add("UserRepository.anyUserPrefersNoScreen", fx.manyUserIds, (userIds) =>
		UserRepository.anyUserPrefersNoScreen(userIds),
	);
	add("UserRepository.findSocialLinksByUserId", fx.heavyUser, (user) =>
		UserRepository.findSocialLinksByUserId(user.id),
	);
	add(
		"UserRepository.findIdsByTwitchUsernames",
		fx.twitchUsernames,
		(twitchUsernames) =>
			UserRepository.findIdsByTwitchUsernames(twitchUsernames),
	);
	add("UserRepository.findWeaponPoolByUserId", fx.heavyUser, (user) =>
		UserRepository.findWeaponPoolByUserId(user.id),
	);

	// VodRepository
	add("VodRepository.findByUserId", fx.vod, (vod) =>
		VodRepository.findByUserId(vod.userId),
	);
	addStatic("VodRepository.findVods.default", () => VodRepository.findVods({}));
	add("VodRepository.findVods.byWeapon", fx.heavyWeaponSplId, (weaponSplId) =>
		VodRepository.findVods({ weapon: weaponSplId }),
	);
	addStatic("VodRepository.countVods", () => VodRepository.countVods({}));
	add("VodRepository.findVodById", fx.vod, (vod) =>
		VodRepository.findVodById(vod.videoId),
	);

	return { cases, skipped };
}

function both<A, B>(a: A | null, b: B | null): [A, B] | null {
	if (a === null || b === null) return null;

	return [a, b];
}
