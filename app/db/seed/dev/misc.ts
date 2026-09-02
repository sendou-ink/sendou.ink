import { sub } from "date-fns";
import { Config } from "~/config";
import type { Tables } from "~/db/tables";
import type { Notification } from "~/features/notifications/notifications-types";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";
import {
	getArtFilename,
	SEED_ART_URLS,
} from "../../../../scripts/seed-art-urls";
import { NZAP_TEST_DISCORD_ID } from "../constants";
import { faker } from "../core/faker";
import placements from "../data/placements.json";
import * as ArtFactory from "../factories/ArtFactory";
import * as FriendRequestFactory from "../factories/FriendRequestFactory";
import * as FriendshipFactory from "../factories/FriendshipFactory";
import * as LiveStreamFactory from "../factories/LiveStreamFactory";
import * as NotificationFactory from "../factories/NotificationFactory";
import * as SplatoonRotationFactory from "../factories/SplatoonRotationFactory";
import * as UserReportFactory from "../factories/UserReportFactory";
import * as XRankPlacementFactory from "../factories/XRankPlacementFactory";
import type { SeededSendouQ } from "./sendouq";
import type { SeededTournaments } from "./tournaments";
import type { SeededUsers } from "./users";

const NZAP_PLAYER_SPL_ID = "qx6imlx72tfeqrhqfnmm";
const FRIEND_COUNT = 8;
/** Friends of the admin, none of them a teammate, so that friends-only surfaces have something to show. */
const ADMIN_FRIEND_COUNT = 3;
const STREAM_COUNT = 20;

export type SeededMisc = {
	/** None of them a teammate. */
	adminFriendIds: number[];
};

export async function seedMisc({
	users,
	sendouq,
	tournaments,
}: {
	users: SeededUsers;
	sendouq: SeededSendouQ;
	tournaments: SeededTournaments;
}): Promise<SeededMisc> {
	await seedXRankPlacements(users);
	await seedArts(users);
	await seedFriends(users);
	await seedNotifications(users, tournaments);
	await seedUserReports(users, sendouq);

	await LiveStreamFactory.replaceAll(
		users.showcaseIds.slice(0, STREAM_COUNT).map((userId) => ({ userId })),
	);
	await SplatoonRotationFactory.replaceAll();

	return { adminFriendIds: adminFriendIds(users) };
}

async function seedXRankPlacements(users: SeededUsers) {
	// a top 500 player who is a site user without plus membership
	const unaffiliatedTopPlayerId = users.crowdIds[users.crowdIds.length - 1];

	for (const [i, placement] of placements.entries()) {
		const playerUserId =
			placement.playerSplId === NZAP_PLAYER_SPL_ID
				? users.nzapId
				: i === 0
					? unaffiliatedTopPlayerId
					: undefined;

		await XRankPlacementFactory.create(
			{
				...placement,
				mode: placement.mode as ModeShort,
				region: placement.region as Tables["XRankPlacement"]["region"],
				weaponSplId: placement.weaponSplId as MainWeaponId,
				playerUserId,
			},
			{ refreshPeakXp: i === placements.length - 1 },
		);
	}
}

async function seedArts(users: SeededUsers) {
	let nextUrl = 0;

	for (const authorId of [users.nzapId, ...users.artistIds]) {
		const artCount = faker.helpers.arrayElement([1, 2, 3, 3, 4]);

		for (let i = 0; i < artCount; i++) {
			await ArtFactory.create({
				authorId,
				url: getArtFilename(nextUrl++ % SEED_ART_URLS.length),
				description:
					faker.number.float(1) < 0.5 ? faker.lorem.paragraph() : null,
				linkedUsers:
					i === 1
						? [
								...(authorId === users.nzapId ? [] : [users.nzapId]),
								...faker.helpers.arrayElements(users.showcaseIds, {
									min: 0,
									max: 2,
								}),
							]
						: [],
			});
		}
	}
}

async function seedFriends(users: SeededUsers) {
	const friendIds = users.showcaseIds.slice(0, FRIEND_COUNT);

	for (const friendId of friendIds) {
		await FriendshipFactory.create({
			userOneId: users.nzapId,
			userTwoId: friendId,
		});
	}

	// mutual friends between some of them, so user cards show the overlap
	await FriendshipFactory.create({
		userOneId: friendIds[0],
		userTwoId: friendIds[1],
	});
	await FriendshipFactory.create({
		userOneId: friendIds[0],
		userTwoId: friendIds[2],
	});

	await FriendRequestFactory.create({
		senderId: users.showcaseIds[FRIEND_COUNT],
		receiverId: users.nzapId,
	});

	for (const friendId of adminFriendIds(users)) {
		await FriendshipFactory.create({
			userOneId: users.adminId,
			userTwoId: friendId,
		});
	}
}

/** Showcase users befriending the admin, taken from past the ones N-ZAP's friendships and friend request use. */
function adminFriendIds(users: SeededUsers) {
	return users.showcaseIds.slice(
		FRIEND_COUNT + 1,
		FRIEND_COUNT + 1 + ADMIN_FRIEND_COUNT,
	);
}

async function seedNotifications(
	users: SeededUsers,
	tournaments: SeededTournaments,
) {
	const { id: tournamentId, name: tournamentName } = tournaments.regOpen;

	const notifications: Notification[] = [
		{ type: "PLUS_SUGGESTION_ADDED", meta: { tier: 1 } },
		{ type: "SEASON_STARTED", meta: { seasonNth: 1 } },
		{ type: "SEASON_ENDED", meta: { seasonNth: 0 } },
		{
			type: "TO_ADDED_TO_TEAM",
			meta: {
				adderUsername: "N-ZAP",
				teamName: "Chimera",
				tournamentId,
				tournamentName,
				tournamentTeamId: 1,
			},
		},
		{
			type: "TO_BRACKET_STARTED",
			meta: {
				tournamentId,
				tournamentName,
				bracketIdx: 0,
				bracketName: "Main Bracket",
			},
		},
		{ type: "BADGE_ADDED", meta: { badgeName: "4v4 Sundaes", badgeId: 1 } },
		{
			type: "TAGGED_TO_ART",
			meta: {
				adderUsername: "N-ZAP",
				adderDiscordId: NZAP_TEST_DISCORD_ID,
				artId: 1,
			},
		},
		{ type: "SQ_ADDED_TO_GROUP", meta: { adderUsername: "N-ZAP" } },
		{ type: "SQ_NEW_MATCH", meta: { matchId: 100 } },
		{
			type: "TEAM_EVENT_ADDED",
			meta: {
				eventName: "VoD review vs. FTWin",
				teamName: "Alliance Rogue",
				teamCustomUrl: "alliance-rogue",
			},
		},
		{ type: "PLUS_VOTING_STARTED", meta: { seasonNth: 1 } },
		{
			type: "TO_CHECK_IN_OPENED",
			meta: { tournamentId, tournamentName },
			pictureUrl: `${Config.staticAssetsUrl}/img/tournament-logos/pn.avif`,
		},
	];

	for (const [i, notification] of notifications.entries()) {
		const createdAt = sub(new Date(), {
			days: notifications.length - 1 - i,
			minutes: i * 17,
		});

		await NotificationFactory.create(
			{
				notification,
				users: [
					{ userId: users.adminId, seen: i <= 7 ? 1 : 0 },
					{ userId: users.nzapId, seen: i <= 7 ? 1 : 0 },
				],
			},
			{ createdAt },
		);
	}
}

async function seedUserReports(users: SeededUsers, sendouq: SeededSendouQ) {
	// uneven spread over the trailing year so the admin tab's bar graph shows variety
	const monthsAgoDistribution = [
		0, 0, 0, 1, 2, 2, 2, 2, 5, 5, 7, 8, 10, 11, 11,
	];

	for (const [i, monthsAgo] of monthsAgoDistribution.entries()) {
		await UserReportFactory.create(
			{
				reportedUserId: users.nzapId,
				reporterUserId: users.showcaseIds[10 + i],
				matchId:
					i % 3 === 0
						? faker.helpers.arrayElement(sendouq.recentMatchIds)
						: null,
			},
			{
				createdAt: sub(new Date(), {
					months: monthsAgo,
					days: (i * 3) % 7,
					hours: i,
				}),
			},
		);
	}
}
