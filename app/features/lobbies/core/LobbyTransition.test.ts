import { describe, expect, test } from "vitest";
import type { LobbyParticipantStatus } from "../lobbies-constants";
import * as LobbyTransition from "./LobbyTransition";
import { setOf } from "./tests/fixtures";

const STARTS_AT = 10_000;
const MINUTE = 60;

type Participant = LobbyTransition.ProgressionState["participants"][number];

function participants(
	count: number,
	overrides: Partial<Participant> = {},
	firstId = 1,
): Participant[] {
	return Array.from({ length: count }, (_, i) => ({
		userId: firstId + i,
		status: "CHECKED_IN" as LobbyParticipantStatus,
		joinedAt: firstId + i,
		isDroppingAfterSet: false,
		isSittingOut: false,
		...overrides,
	}));
}

function state(
	overrides: {
		lobby?: Partial<LobbyTransition.ProgressionState["lobby"]>;
		participants?: Participant[];
		latestSet?: LobbyTransition.ProgressionState["latestSet"];
		readyChecks?: LobbyTransition.ProgressionState["readyChecks"];
	} = {},
): LobbyTransition.ProgressionState {
	return {
		lobby: {
			hostUserId: 1,
			startsAt: STARTS_AT,
			roomSize: 10,
			pendingSince: null,
			endedAt: null,
			...overrides.lobby,
		},
		participants: overrides.participants ?? participants(8),
		latestSet: overrides.latestSet ?? null,
		readyChecks: overrides.readyChecks ?? [],
	};
}

const playingSet = () => ({
	...setOf(),
	lastActivityAt: STARTS_AT,
});
const finishedSet = () => ({
	...setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
	lastActivityAt: STARTS_AT,
});

const inRoom = (count: number, firstId = 1) =>
	participants(count, { status: "IN_ROOM" }, firstId);

describe("LobbyTransition.next", () => {
	test("nothing to do before the start when everyone has a spot", () => {
		expect(LobbyTransition.next(state(), STARTS_AT - 1)).toBeNull();
	});

	test("promotes the waitlisted when spots free up before the start", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { roomSize: 9 },
				participants: [
					...participants(8, { status: "REGISTERED" }),
					...participants(2, { status: "WAITLISTED" }, 9),
				],
			}),
			STARTS_AT - 1,
		);

		expect(result).toEqual({ type: "PROMOTE", userIds: [9] });
	});

	test("starts with 8 checked in", () => {
		const result = LobbyTransition.next(state(), STARTS_AT);

		expect(result).toEqual({
			type: "START",
			userIds: [1, 2, 3, 4, 5, 6, 7, 8],
		});
	});

	test("removes those who didn't check in before starting", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...participants(8),
					...participants(1, { status: "REGISTERED" }, 9),
					...participants(1, { status: "WAITLISTED" }, 10),
				],
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "REMOVE", userIds: [9, 10] });
	});

	test("starts with as many checked in as fit the room", () => {
		const result = LobbyTransition.next(
			state({ lobby: { roomSize: 9 }, participants: participants(10) }),
			STARTS_AT,
		);

		expect(result).toEqual({
			type: "START",
			userIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
		});
	});

	test("stays pending with 7 checked in", () => {
		const result = LobbyTransition.next(
			state({ participants: participants(7) }),
			STARTS_AT,
		);

		expect(result).toEqual({
			type: "SET_PENDING_SINCE",
			pendingSince: STARTS_AT,
		});
	});

	test("closes 2 hours pending", () => {
		const result = LobbyTransition.next(
			state({
				participants: participants(7),
				lobby: { pendingSince: STARTS_AT },
			}),
			STARTS_AT + 120 * MINUTE,
		);

		expect(result).toEqual({ type: "END" });
	});

	test("closes 2 hours after the latest report", () => {
		const result = LobbyTransition.next(
			state({ participants: inRoom(8), latestSet: playingSet() }),
			STARTS_AT + 120 * MINUTE,
		);

		expect(result).toEqual({ type: "END" });
	});

	test("ends once everyone has left", () => {
		expect(
			LobbyTransition.next(state({ participants: [] }), STARTS_AT),
		).toEqual({ type: "END" });
	});

	test("passes the host to the longest-tenured participant", () => {
		const result = LobbyTransition.next(
			state({ lobby: { hostUserId: 99 } }),
			STARTS_AT - 1,
		);

		expect(result).toEqual({ type: "TRANSFER_HOST", userId: 1 });
	});

	test("starts the first set once the room is filled", () => {
		const result = LobbyTransition.next(
			state({ participants: inRoom(8) }),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "START_SET" });
	});

	test("nothing to do while a set is played", () => {
		const result = LobbyTransition.next(
			state({ participants: inRoom(8), latestSet: playingSet() }),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});

	test("starts the next set once the previous is confirmed", () => {
		const result = LobbyTransition.next(
			state({ participants: inRoom(8), latestSet: finishedSet() }),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "START_SET" });
	});

	test("removes who dropped once their set is finished", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(7),
					{ ...inRoom(1, 8)[0], isDroppingAfterSet: true },
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "REMOVE", userIds: [8] });
	});

	test("keeps who dropped while their set is played", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(7),
					{ ...inRoom(1, 8)[0], isDroppingAfterSet: true },
				],
				latestSet: playingSet(),
			}),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});

	test("a short room pings the waitlist", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(7),
					...participants(1, { status: "WAITLISTED" }, 20),
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "OPEN_SLOT_CHECK" });
	});

	test("a set doesn't start while someone sitting out leaves fewer than 8 to play", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { pendingSince: STARTS_AT },
				participants: [
					...inRoom(7),
					{ ...inRoom(1, 8)[0], isSittingOut: true },
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});

	test("starts the next set without who is sitting out", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(8),
					{ ...inRoom(1, 9)[0], isSittingOut: true },
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "START_SET" });
	});

	test("pings the waitlist when someone sitting out leaves the room short", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(7),
					{ ...inRoom(1, 8)[0], isSittingOut: true },
					...participants(1, { status: "WAITLISTED" }, 20),
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "OPEN_SLOT_CHECK" });
	});

	test("a full room short of players doesn't ping the waitlist", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { roomSize: 8, pendingSince: STARTS_AT },
				participants: [
					...inRoom(7),
					{ ...inRoom(1, 8)[0], isSittingOut: true },
					...participants(1, { status: "WAITLISTED" }, 20),
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});

	test("a short room with nobody waiting stays pending", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { pendingSince: STARTS_AT },
				participants: inRoom(7),
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});

	test("fills the slot of the head of the waitlist confirming", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { roomSize: 8 },
				participants: [
					...inRoom(7),
					...participants(2, { status: "WAITLISTED" }, 20),
				],
				latestSet: finishedSet(),
				readyChecks: [
					{
						id: 1,
						expiresAt: STARTS_AT + 3 * MINUTE,
						users: [
							{ userId: 20, confirmedAt: STARTS_AT },
							{ userId: 21, confirmedAt: null },
						],
					},
				],
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "FILL_SLOTS", userIds: [20] });
	});

	test("closes the ready check once the room is full", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { roomSize: 8 },
				participants: [
					...inRoom(8),
					...participants(1, { status: "WAITLISTED" }, 20),
				],
				latestSet: finishedSet(),
				readyChecks: [{ id: 1, expiresAt: STARTS_AT, users: [] }],
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "CLOSE_CHECK", readyCheckId: 1 });
	});

	test("places a late check-in as a spectator", () => {
		const result = LobbyTransition.next(
			state({
				participants: [...inRoom(8), ...participants(1, {}, 20)],
				latestSet: playingSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "FILL_SLOTS", userIds: [20] });
	});

	test("a checked in participant fills a short room without a ready check", () => {
		const result = LobbyTransition.next(
			state({
				participants: [
					...inRoom(7),
					...participants(1, { status: "WAITLISTED" }, 20),
					...participants(1, {}, 21),
				],
				latestSet: finishedSet(),
			}),
			STARTS_AT,
		);

		expect(result).toEqual({ type: "FILL_SLOTS", userIds: [21] });
	});

	test("checked in past the room size keep waiting", () => {
		const result = LobbyTransition.next(
			state({
				lobby: { roomSize: 8 },
				participants: [...inRoom(8), ...participants(2, {}, 20)],
				latestSet: playingSet(),
			}),
			STARTS_AT,
		);

		expect(result).toBeNull();
	});
});
