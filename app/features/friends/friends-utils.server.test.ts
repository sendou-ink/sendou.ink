import { addHours, subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as LobbyActivity from "~/features/lobbies/core/LobbyActivity.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import { runningTournamentWithMatch } from "~/features/tournament-bracket/core/tests/test-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	isJoinableFriendLobby,
	resolveFriendActivity,
	resolveUpcomingLobbiesOfFriends,
	resolveVisibleActiveLobbiesOfFriends,
} from "./friends-utils.server";

const users = UserFactory.pool();

const viewerId = () => users.id(1);
const friendId = () => users.id(2);
const outsiderId = () => users.id(3);

const UPCOMING_LOBBY = {
	lobbyId: 999,
	lobbyName: "Upcoming lobby",
	participantCount: 3,
	roomSize: 10,
};

describe("resolveFriendActivity", () => {
	beforeEach(async () => {
		await users.create(3);
		RunningTournaments.clear();
		await refreshSendouQInstance();
		await LobbyActivity.refresh();
	});

	test("a tournament match comes before a lobby", async () => {
		await friendInStartedLobby();
		RunningTournaments.add(
			runningTournamentWithMatch({
				tournamentId: 1,
				teamOneUserIds: [friendId()],
				teamTwoUserIds: [outsiderId()],
			}),
		);

		expect((await activityOfFriend()).type).toBe("TOURNAMENT_MATCH");
	});

	test("a lobby comes before looking for members", async () => {
		const lobby = await friendInStartedLobby();
		await SQGroupFactory.create({ memberUserIds: [friendId()] });
		await refreshSendouQInstance();

		const activity = await activityOfFriend();

		expect(activity.type).toBe("LOBBY");
		expect(activity.lobbyId).toBe(lobby.id);
	});

	test("looking for members comes before an upcoming lobby", async () => {
		await SQGroupFactory.create({ memberUserIds: [friendId()] });
		await refreshSendouQInstance();

		expect((await activityOfFriend(UPCOMING_LOBBY)).type).toBe("SENDOUQ");
	});

	test("an upcoming lobby shows when nothing else does", async () => {
		const activity = await activityOfFriend(UPCOMING_LOBBY);

		expect(activity.type).toBe("LOBBY_UPCOMING");
		expect(activity.badge).toBe("3/10");
	});

	test("a lobby the viewer can't see is not shown", async () => {
		const association = await AssociationFactory.create({
			userId: friendId(),
		});
		await friendInStartedLobby({ forAssociation: association.id });

		expect((await activityOfFriend()).type).toBeNull();
	});
});

describe("isJoinableFriendLobby", () => {
	beforeEach(async () => {
		await users.create(9);
		RunningTournaments.clear();
		await refreshSendouQInstance();
	});

	test("a lobby with a free spot is joinable", async () => {
		await friendInStartedLobby();

		expect(await isFriendLobbyJoinable()).toBe(true);
	});

	test("a full lobby is not joinable", async () => {
		await friendInStartedLobby(null, {
			signedUpUserIds: users.ids(9).slice(2),
		});

		expect(await isFriendLobbyJoinable()).toBe(false);
	});

	test("a lobby the viewer is already in is not joinable", async () => {
		await friendInStartedLobby(null, { signedUpUserIds: [viewerId()] });

		expect(await isFriendLobbyJoinable()).toBe(false);
	});
});

describe("resolveUpcomingLobbiesOfFriends", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("keeps only the soonest lobby of each friend", async () => {
		await FriendshipFactory.create({
			userOneId: viewerId(),
			userTwoId: friendId(),
		});
		await LobbyFactory.create({
			hostUserId: friendId(),
			startsAt: dateToDatabaseTimestamp(addHours(new Date(), 3)),
		});
		const soonest = await LobbyFactory.create({
			hostUserId: friendId(),
			startsAt: dateToDatabaseTimestamp(addHours(new Date(), 1)),
		});

		const result = await resolveUpcomingLobbiesOfFriends(viewerId());

		expect([...result.keys()]).toEqual([friendId()]);
		expect(result.get(friendId())?.lobbyId).toBe(soonest.id);
	});
});

async function friendInStartedLobby(
	visibility: { forAssociation: number } | null = null,
	{ signedUpUserIds }: { signedUpUserIds?: number[] } = {},
) {
	const lobby = await LobbyFactory.create(
		{
			hostUserId: friendId(),
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			visibility,
		},
		{ signedUpUserIds, checkedInUserIds: [friendId()] },
	);
	await LobbyActivity.refresh();

	return lobby;
}

async function activityOfFriend(upcomingLobby?: typeof UPCOMING_LOBBY) {
	return resolveFriendActivity({
		friendId: friendId(),
		tournamentId: null,
		tournamentName: null,
		teamMemberCount: null,
		tournamentMinTeamSize: null,
		sendouQMatchStreams: new Map(),
		visibleLobbies: await visibleLobbiesOfFriend(),
		upcomingLobby,
	});
}

async function isFriendLobbyJoinable() {
	return isJoinableFriendLobby({
		activity: await activityOfFriend(),
		visibleLobbies: await visibleLobbiesOfFriend(),
	});
}

function visibleLobbiesOfFriend() {
	return resolveVisibleActiveLobbiesOfFriends({
		viewerId: viewerId(),
		friendIds: [friendId()],
	});
}
