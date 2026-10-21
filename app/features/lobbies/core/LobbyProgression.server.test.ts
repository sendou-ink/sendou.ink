import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import * as LobbyProgression from "./LobbyProgression.server";
import * as LobbySet from "./LobbySet";

const users = UserFactory.pool();

const hostId = () => users.id(1);

const startedAt = () => dateToDatabaseTimestamp(subMinutes(new Date(), 1));

async function startedLobby({
	checkedInCount,
	waitlistedCount = 0,
	roomSize = 8,
}: {
	checkedInCount: number;
	waitlistedCount?: number;
	roomSize?: 8 | 9 | 10;
}) {
	const lobby = await LobbyFactory.create(
		{ hostUserId: hostId(), startsAt: startedAt(), roomSize },
		{
			signedUpUserIds: users.ids(checkedInCount).slice(1),
			checkedInUserIds: users.ids(checkedInCount),
			lateWaitlistedUserIds: users
				.ids(checkedInCount + waitlistedCount)
				.slice(checkedInCount),
		},
	);
	await LobbyProgression.advance(lobby.id);

	return lobby.id;
}

async function latestSet(lobbyId: number) {
	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);
	return sets.at(-1)!;
}

/** Reports every map to the alpha side until the set is decided, then confirms it as bravo. */
async function playOut(lobbyId: number) {
	const set = await latestSet(lobbyId);
	const alphaPlayer = LobbySet.playersOf(set, "ALPHA")[0];
	const bravoPlayer = LobbySet.playersOf(set, "BRAVO")[0];

	for (let i = 0; i < Math.ceil(set.bestOf / 2); i++) {
		await withUserId(alphaPlayer, () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "ALPHA",
				reportedCount: i,
			}),
		);
	}
	await withUserId(bravoPlayer, () => LobbyMatchRepository.confirmSet(set.id));
	await LobbyProgression.advance(lobbyId);
}

describe("LobbyProgression.advance", () => {
	beforeEach(async () => {
		await users.create(12);
	});

	test("nothing starts before the start time", async () => {
		const lobby = await LobbyFactory.create(
			{ hostUserId: hostId() },
			{
				signedUpUserIds: users.ids(8).slice(1),
				checkedInUserIds: users.ids(8),
			},
		);

		await LobbyProgression.advance(lobby.id);

		expect(await roomMemberIds(lobby.id)).toEqual([]);
		expect(
			await LobbyMatchRepository.findAllSetsByLobbyId(lobby.id),
		).toHaveLength(0);
	});

	test("fills the room and starts its first set with 8 checked in", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 8 });

		const set = await latestSet(lobbyId);

		expect(await roomMemberIds(lobbyId)).toHaveLength(8);
		expect(LobbySet.playersOf(set, "ALPHA")).toHaveLength(4);
		expect(LobbySet.playersOf(set, "BRAVO")).toHaveLength(4);
		expect(set.games).toHaveLength(3);
	});

	test("stays pending with 7 checked in", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 7 });

		const lobby = await LobbyRepository.findProgressionStateById(lobbyId);

		expect(await roomMemberIds(lobbyId)).toEqual([]);
		expect(lobby?.pendingSince).not.toBeNull();
	});

	test("starts the next set once the previous is confirmed", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 8 });

		await playOut(lobbyId);

		const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);
		expect(sets).toHaveLength(2);
		expect(LobbySet.status(sets[0])).toBe("CONFIRMED");
		expect(LobbySet.status(sets[1])).toBe("REPORTING");
	});

	test("a spectator sits out and rotates in", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 9, roomSize: 9 });

		const first = await latestSet(lobbyId);
		const firstSitOut = first.participants.find((p) => p.side === null)!;

		await playOut(lobbyId);

		const second = await latestSet(lobbyId);
		expect(LobbySet.sideOf(second, firstSitOut.userId)).not.toBeNull();
	});

	test("who the host sits out stays out of sets until resumed", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 9, roomSize: 9 });
		const sittingOutId = users.id(9);
		await LobbyRepository.updateParticipant({
			lobbyId,
			userId: sittingOutId,
			isSittingOut: true,
		});

		await playOut(lobbyId);
		await playOut(lobbyId);

		const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);
		for (const set of sets.slice(1)) {
			expect(set.participants.map((p) => p.userId)).not.toContain(sittingOutId);
		}
	});

	test("leaving mid-set forfeits it for the leaver's side", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 8 });
		const set = await latestSet(lobbyId);
		const leaverId = LobbySet.playersOf(set, "BRAVO")[0];

		await LobbyRepository.removeParticipant({
			lobbyId,
			userId: leaverId,
			unfinishedSetId: set.id,
		});
		await LobbyProgression.advance(lobbyId);

		const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);
		expect(LobbySet.status(sets[0])).toBe("FORFEITED");
		expect(LobbySet.winnerSide(sets[0])).toBe("ALPHA");
	});

	test("a room short of players pings the waitlist", async () => {
		const lobbyId = await startedLobby({
			checkedInCount: 8,
			waitlistedCount: 2,
		});
		const set = await latestSet(lobbyId);

		await LobbyRepository.removeParticipant({
			lobbyId,
			userId: LobbySet.playersOf(set, "BRAVO")[0],
			unfinishedSetId: set.id,
		});
		await LobbyProgression.advance(lobbyId);

		const state = await LobbyRepository.findProgressionStateById(lobbyId);
		expect(state?.readyChecks).toHaveLength(1);
		expect(state?.readyChecks[0].users).toHaveLength(2);
	});

	test("the head of the waitlist confirming fills the slot right away", async () => {
		const lobbyId = await startedLobby({
			checkedInCount: 8,
			waitlistedCount: 2,
		});
		const set = await latestSet(lobbyId);
		const waitlistHeadId = users.id(9);

		await LobbyRepository.removeParticipant({
			lobbyId,
			userId: LobbySet.playersOf(set, "BRAVO")[0],
			unfinishedSetId: set.id,
		});
		await LobbyProgression.advance(lobbyId);
		await LobbyMatchRepository.confirmReadyChecks({
			lobbyId,
			userId: waitlistHeadId,
		});
		await LobbyProgression.advance(lobbyId);

		const nextSet = await latestSet(lobbyId);
		expect(LobbySet.sideOf(nextSet, waitlistHeadId)).not.toBeNull();
	});

	test("dropping after the set leaves once it's confirmed", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 9, roomSize: 9 });
		const set = await latestSet(lobbyId);
		const dropperId = LobbySet.playersOf(set, "ALPHA")[1];

		await LobbyRepository.updateParticipant({
			lobbyId,
			userId: dropperId,
			isDroppingAfterSet: true,
		});
		await LobbyProgression.advance(lobbyId);
		expect(
			(await LobbyRepository.findProgressionStateById(lobbyId))?.participants,
		).toHaveLength(9);

		await playOut(lobbyId);

		const state = await LobbyRepository.findProgressionStateById(lobbyId);
		expect(state?.participants.map((p) => p.userId)).not.toContain(dropperId);
	});

	test("the host leaving passes the host on", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 8 });
		const set = await latestSet(lobbyId);

		await LobbyRepository.removeParticipant({
			lobbyId,
			userId: hostId(),
			unfinishedSetId: LobbySet.sideOf(set, hostId()) ? set.id : null,
		});
		await LobbyProgression.advance(lobbyId);

		const state = await LobbyRepository.findProgressionStateById(lobbyId);
		expect(state?.hostUserId).toBe(users.id(2));
	});

	test("who checked in past the room size takes the spot of a leaver", async () => {
		const lobbyId = await startedLobby({ checkedInCount: 9 });
		const set = await latestSet(lobbyId);
		const waitingId = users.id(9);

		await LobbyRepository.removeParticipant({
			lobbyId,
			userId: LobbySet.playersOf(set, "BRAVO")[0],
			unfinishedSetId: set.id,
		});
		await LobbyProgression.advance(lobbyId);

		const nextSet = await latestSet(lobbyId);
		expect(LobbySet.sideOf(nextSet, waitingId)).not.toBeNull();
	});
});

async function roomMemberIds(lobbyId: number) {
	const state = await LobbyRepository.findProgressionStateById(lobbyId);

	return (state?.participants ?? [])
		.filter((participant) => participant.status === "IN_ROOM")
		.map((participant) => participant.userId);
}
