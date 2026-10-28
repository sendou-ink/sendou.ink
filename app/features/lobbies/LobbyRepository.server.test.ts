import { beforeEach, describe, expect, test } from "bun:test";
import { subMinutes } from "date-fns";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withNoUser, withUserId } from "~/utils/Test";
import * as LobbySet from "./core/LobbySet";
import * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import * as LobbyRepository from "./LobbyRepository.server";

const users = UserFactory.pool();

const hostId = () => users.id(1);
const memberId = () => users.id(2);
const outsiderId = () => users.id(3);

describe("LobbyRepository visibility", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const associationLobby = async () => {
		const association = await AssociationFactory.create(
			{ userId: hostId() },
			{ memberUserIds: [memberId()] },
		);

		return LobbyFactory.create({
			hostUserId: hostId(),
			visibility: { forAssociation: association.id },
		});
	};

	test.each([
		{ why: "a member sees it", viewer: memberId, expected: true },
		{ why: "an outsider doesn't", viewer: outsiderId, expected: false },
		{ why: "the host does", viewer: hostId, expected: true },
	])("$why", async ({ viewer, expected }) => {
		const lobby = await associationLobby();

		const found = await withUserId(viewer(), () =>
			LobbyRepository.findById(lobby.id),
		);
		const listed = await withUserId(viewer(), () =>
			LobbyRepository.findAllForIndex(),
		);

		expect(Boolean(found)).toBe(expected);
		expect(
			listed.upcoming.some((listedLobby) => listedLobby.id === lobby.id),
		).toBe(expected);
	});

	test("logged out see public lobbies only", async () => {
		const publicLobby = await LobbyFactory.create({ hostUserId: hostId() });
		await associationLobby();

		const listed = await withNoUser(() => LobbyRepository.findAllForIndex());

		expect(listed.upcoming.map((lobby) => lobby.id)).toEqual([publicLobby.id]);
	});

	test("a signed up participant always sees the lobby", async () => {
		const lobby = await associationLobby();
		await LobbyRepository.insertParticipant({
			lobbyId: lobby.id,
			userId: outsiderId(),
			status: "REGISTERED",
		});

		const found = await withUserId(outsiderId(), () =>
			LobbyRepository.findById(lobby.id),
		);

		expect(found?.id).toBe(lobby.id);
	});

	test.each([
		{ why: "an outsider with the key sees it", withKey: true, expected: true },
		{
			why: "an outsider without the key doesn't",
			withKey: false,
			expected: false,
		},
	])("link-only: $why", async ({ withKey, expected }) => {
		const lobby = await LobbyFactory.create({
			hostUserId: hostId(),
			visibility: "LINK_ONLY",
		});
		const shareKey = (
			await withUserId(hostId(), () => LobbyRepository.findById(lobby.id))
		)?.shareKey;

		const found = await withUserId(outsiderId(), () =>
			LobbyRepository.findById(lobby.id, {
				shareKey: withKey ? shareKey : "wrongKey12",
			}),
		);
		const listed = await withUserId(outsiderId(), () =>
			LobbyRepository.findAllForIndex(),
		);

		expect(Boolean(found)).toBe(expected);
		expect(listed.upcoming).toEqual([]);
	});

	test("link-only: a participant other than the host gets no share key", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId(), visibility: "LINK_ONLY" },
			{ signedUpUserIds: [memberId()] },
		);

		const asHost = await withUserId(hostId(), () =>
			LobbyRepository.findById(lobby.id),
		);
		const asParticipant = await withUserId(memberId(), () =>
			LobbyRepository.findById(lobby.id),
		);

		expect(asHost?.shareKey).toEqual(expect.any(String));
		expect(asParticipant?.shareKey).toBeNull();
	});

	test("link-only: a lobby with visibility has no share key", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		const found = await withUserId(hostId(), () =>
			LobbyRepository.findById(lobby.id),
		);

		expect(found?.shareKey).toBeNull();
	});
});

describe("LobbyRepository.findAllForIndex", () => {
	beforeEach(async () => {
		await users.create(9);
	});

	test("lists ended lobbies the viewer was in only", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{ signedUpUserIds: [memberId()], isEnded: true },
		);

		const memberListed = await withUserId(memberId(), () =>
			LobbyRepository.findAllForIndex(),
		);
		const outsiderListed = await withUserId(outsiderId(), () =>
			LobbyRepository.findAllForIndex(),
		);

		expect(memberListed.ended.map((listed) => listed.id)).toEqual([lobby.id]);
		expect(outsiderListed.ended).toEqual([]);
	});

	test("tells apart spectating from playing in the room", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
				roomSize: 9,
			},
			{
				signedUpUserIds: users.ids(9).slice(1),
				checkedInUserIds: users.ids(9),
				reportedMapCount: 1,
			},
		);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const spectatorId = set.participants.find(
			(participant) => participant.side === null,
		)!.userId;
		const playerId = LobbySet.playersOf(set, "ALPHA")[0];

		const statusOf = async (userId: number) => {
			const listed = await withUserId(userId, () =>
				LobbyRepository.findAllForIndex(),
			);
			return listed.running.find((listedLobby) => listedLobby.id === lobby.id)
				?.viewerStatus;
		};

		expect(await statusOf(spectatorId)).toBe("SPECTATING");
		expect(await statusOf(playerId)).toBe("IN_ROOM");
	});

	test("a player who left after a set still sees the ended private lobby", async () => {
		const association = await AssociationFactory.create({ userId: hostId() });
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
				visibility: { forAssociation: association.id },
			},
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(8),
				playedSetCount: 1,
			},
		);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const leaverId = LobbySet.playersOf(set, "ALPHA").find(
			(userId) => userId !== hostId(),
		)!;
		await LobbyRepository.removeParticipant({
			lobbyId: lobby.id,
			userId: leaverId,
			unfinishedSetId: null,
		});
		await LobbyRepository.end(lobby.id);

		const listed = await withUserId(leaverId, () =>
			LobbyRepository.findAllForIndex(),
		);
		const found = await withUserId(leaverId, () =>
			LobbyRepository.findById(lobby.id),
		);

		expect(listed.ended.map((listedLobby) => listedLobby.id)).toEqual([
			lobby.id,
		]);
		expect(found?.id).toBe(lobby.id);
	});
});

describe("LobbyRepository.findAllUpcomingOfFriendsByUserId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("lists a friend's upcoming lobby the viewer isn't in", async () => {
		await FriendshipFactory.create({
			userOneId: Math.min(hostId(), memberId()),
			userTwoId: Math.max(hostId(), memberId()),
		});
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		const rows =
			await LobbyRepository.findAllUpcomingOfFriendsByUserId(memberId());

		expect(rows.map((row) => [row.friendId, row.lobbyId])).toEqual([
			[hostId(), lobby.id],
		]);
	});
});
