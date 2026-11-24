import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as LobbyProgression from "./core/LobbyProgression.server";
import * as LobbySet from "./core/LobbySet";
import * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import * as LobbyRepository from "./LobbyRepository.server";

const users = UserFactory.pool();

const hostId = () => users.id(1);

const MAPS_TO_WIN = 2;

describe("LobbyMatchRepository.findAllTeamChatsByChatRoomIds", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test("a player who left is no longer in their team chat", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(8),
			},
		);
		await LobbyProgression.advance(lobby.id);
		const [set] = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);
		const [leaverId, ...stayingIds] = LobbySet.playersOf(set, "ALPHA");
		// a set without a map reported would be called off
		await withUserId(leaverId, () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "ALPHA",
				reportedCount: 0,
			}),
		);

		await LobbyRepository.removeParticipant({
			lobbyId: lobby.id,
			userId: leaverId,
			unfinishedSetId: set.id,
		});

		const [teamChat] = await LobbyMatchRepository.findAllTeamChatsByChatRoomIds(
			[set.alphaChatRoomId!],
		);
		expect(teamChat.userIds).toEqual(expect.arrayContaining(stayingIds));
		expect(teamChat.userIds).toHaveLength(stayingIds.length);
	});

	test("every set has its own team chats, the finished set's inactive", async () => {
		const lobby = await LobbyFactory.create(
			{
				hostUserId: hostId(),
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			},
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(8),
				playedSetCount: 1,
			},
		);
		const [previousSet, currentSet] =
			await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);

		const teamChats = await LobbyMatchRepository.findAllTeamChatsByChatRoomIds([
			previousSet.alphaChatRoomId!,
			currentSet.alphaChatRoomId!,
		]);

		expect(currentSet.alphaChatRoomId).not.toBe(previousSet.alphaChatRoomId);
		expect(
			teamChats.map(({ chatRoomId, isInactive }) => ({
				chatRoomId,
				isInactive,
			})),
		).toEqual(
			expect.arrayContaining([
				{ chatRoomId: previousSet.alphaChatRoomId, isInactive: true },
				{ chatRoomId: currentSet.alphaChatRoomId, isInactive: false },
			]),
		);
	});
});

describe("LobbyMatchRepository.confirmReadyChecks", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("confirms nothing with no ready check open", async () => {
		const lobby = await LobbyFactory.create({ hostUserId: hostId() });

		expect(
			await LobbyMatchRepository.confirmReadyChecks({
				lobbyId: lobby.id,
				userId: hostId(),
			}),
		).toBe(false);
	});
});

describe("LobbyMatchRepository.reportGame", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test("reports the current map's winner as the reporter", async () => {
		const set = await currentSetOfStartedLobby();
		const [reporterId] = LobbySet.playersOf(set, "BRAVO");

		const result = await withUserId(reporterId, () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "BRAVO",
				reportedCount: 0,
			}),
		);

		expect(result).toBe("REPORTED");
		expect((await refetch(set)).games[0]).toMatchObject({
			winnerSide: "BRAVO",
			reportedByUserId: reporterId,
		});
	});

	test("is stale when someone else reported in between", async () => {
		const set = await currentSetOfStartedLobby({ reportedMapCount: 1 });

		const result = await withUserId(LobbySet.playersOf(set, "BRAVO")[0], () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "BRAVO",
				reportedCount: 0,
			}),
		);

		expect(result).toBe("STALE");
		expect(LobbySet.reportedCount(await refetch(set))).toBe(1);
	});

	test("isn't allowed once the set is decided", async () => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
		});

		const result = await withUserId(LobbySet.playersOf(set, "ALPHA")[0], () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "ALPHA",
				reportedCount: MAPS_TO_WIN,
			}),
		);

		expect(result).toBe("NOT_ALLOWED");
	});
});

describe("LobbyMatchRepository.undoLatestReport", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test("undoing the deciding map clears the dispute", async () => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
			isDisputed: true,
		});

		const result = await withUserId(LobbySet.playersOf(set, "ALPHA")[0], () =>
			LobbyMatchRepository.undoLatestReport({
				setId: set.id,
				reportedCount: MAPS_TO_WIN,
				isHost: false,
			}),
		);

		const updated = await refetch(set);
		expect(result).toBe("REPORTED");
		expect(LobbySet.reportedCount(updated)).toBe(MAPS_TO_WIN - 1);
		expect(updated.disputedAt).toBeNull();
	});

	test.each([
		{
			why: "the confirming side may not",
			isHost: false,
			expected: "NOT_ALLOWED",
		},
		{ why: "the host may for either side", isHost: true, expected: "REPORTED" },
	])("decided set: $why", async ({ isHost, expected }) => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
		});

		const result = await withUserId(LobbySet.playersOf(set, "BRAVO")[0], () =>
			LobbyMatchRepository.undoLatestReport({
				setId: set.id,
				reportedCount: MAPS_TO_WIN,
				isHost,
			}),
		);

		expect(result).toBe(expected);
	});
});

describe("LobbyMatchRepository.confirmSet", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test.each([
		{
			why: "the side that didn't report confirms",
			side: "BRAVO",
			expected: "REPORTED",
		},
		{ why: "the reporting side can't", side: "ALPHA", expected: "NOT_ALLOWED" },
	] as const)("$why", async ({ side, expected }) => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
		});
		const [confirmerId] = LobbySet.playersOf(set, side);

		const result = await withUserId(confirmerId, () =>
			LobbyMatchRepository.confirmSet(set.id),
		);

		expect(result).toBe(expected);
		expect(LobbySet.isFinished(await refetch(set))).toBe(
			expected === "REPORTED",
		);
	});

	test("confirming a confirmed set is stale", async () => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
		});
		const [confirmerId] = LobbySet.playersOf(set, "BRAVO");
		await withUserId(confirmerId, () =>
			LobbyMatchRepository.confirmSet(set.id),
		);

		const result = await withUserId(confirmerId, () =>
			LobbyMatchRepository.confirmSet(set.id),
		);

		expect(result).toBe("STALE");
	});
});

describe("LobbyMatchRepository.disputeSet", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test.each([
		{
			why: "the confirming side disputes",
			side: "BRAVO",
			expected: "REPORTED",
		},
		{ why: "the reporting side can't", side: "ALPHA", expected: "NOT_ALLOWED" },
	] as const)("$why", async ({ side, expected }) => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
		});

		const result = await withUserId(LobbySet.playersOf(set, side)[0], () =>
			LobbyMatchRepository.disputeSet(set.id),
		);

		expect(result).toBe(expected);
		expect(LobbySet.status(await refetch(set))).toBe(
			expected === "REPORTED" ? "DISPUTED" : "AWAITING_CONFIRMATION",
		);
	});
});

describe("LobbyMatchRepository.confirmDisputedSet", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test.each([
		{ why: "settles a disputed set", isDisputed: true, expected: "REPORTED" },
		{
			why: "isn't for an undisputed one",
			isDisputed: false,
			expected: "NOT_ALLOWED",
		},
	])("$why", async ({ isDisputed, expected }) => {
		const set = await currentSetOfStartedLobby({
			reportedMapCount: MAPS_TO_WIN,
			isDisputed,
		});

		const result = await withUserId(hostId(), () =>
			LobbyMatchRepository.confirmDisputedSet(set.id),
		);

		expect(result).toBe(expected);
	});
});

describe("LobbyMatchRepository.endLeftSet", () => {
	beforeEach(async () => {
		await users.create(9);
	});

	test.each([
		{
			why: "no map reported calls the set off",
			reportedMapCount: 0,
			expected: "CALLED_OFF",
		},
		{
			why: "an undecided set is forfeited by the leaver's side",
			reportedMapCount: 1,
			expected: "FORFEITED",
		},
		{
			why: "a decided result stands as confirmed",
			reportedMapCount: MAPS_TO_WIN,
			expected: "CONFIRMED",
		},
	])("$why", async ({ reportedMapCount, expected }) => {
		const set = await currentSetOfStartedLobby({ reportedMapCount });
		const [leaverId] = LobbySet.playersOf(set, "BRAVO");

		const ending = await LobbyMatchRepository.endLeftSet({
			setId: set.id,
			userId: leaverId,
		});

		const sets = await LobbyMatchRepository.findAllSetsByLobbyId(set.lobbyId);
		expect(ending).toBe(expected);
		expect(sets.map(LobbySet.status)).toEqual(
			expected === "CALLED_OFF" ? [] : [expected],
		);
		if (expected === "FORFEITED") {
			expect(LobbySet.winnerSide(sets[0])).toBe("ALPHA");
		}
	});

	test("does nothing for a user not playing the set", async () => {
		const set = await currentSetOfStartedLobby({ reportedMapCount: 1 });

		const ending = await LobbyMatchRepository.endLeftSet({
			setId: set.id,
			userId: users.id(9),
		});

		expect(ending).toBeNull();
	});
});

/** The set being played in a lobby the 8 users checked in to, which started a minute ago. */
async function currentSetOfStartedLobby(
	options: Pick<
		NonNullable<Parameters<typeof LobbyFactory.create>[1]>,
		"reportedMapCount" | "isDisputed"
	> = {},
) {
	const lobby = await LobbyFactory.create(
		{
			hostUserId: hostId(),
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
		},
		{
			signedUpUserIds: users.ids(8).slice(1),
			checkedInUserIds: users.ids(8),
			...options,
		},
	);
	if (
		options.reportedMapCount === 0 ||
		options.reportedMapCount === undefined
	) {
		await LobbyProgression.advance(lobby.id);
	}
	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id);

	return { ...sets.at(-1)!, lobbyId: lobby.id };
}

async function refetch(set: { id: number; lobbyId: number }) {
	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(set.lobbyId);

	return sets.find((candidate) => candidate.id === set.id)!;
}
