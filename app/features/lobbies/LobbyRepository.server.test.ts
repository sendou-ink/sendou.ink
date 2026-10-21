import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
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

		const rows = await LobbyRepository.findAllUpcomingOfFriendsByUserId(
			memberId(),
		);

		expect(rows.map((row) => [row.friendId, row.lobbyId])).toEqual([
			[hostId(), lobby.id],
		]);
	});
});
