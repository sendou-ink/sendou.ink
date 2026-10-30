import { describe, expect, test } from "vitest";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as VoiceAccess from "./VoiceAccess";

const PLAYER_ID = 1;
const TEAMMATE_ID = 2;
const ORGANIZER_ID = 3;
const OUTSIDER_ID = 4;

function resolvedRoom(
	overrides: Partial<
		Pick<
			ResolvedRoom,
			| "type"
			| "isLookingForMembers"
			| "inactive"
			| "participantUserIds"
			| "permissions"
			| "closedAt"
			| "expiresAt"
		>
	> = {},
) {
	return {
		type: "TOURNAMENT_MATCH" as ResolvedRoom["type"],
		isLookingForMembers: false,
		inactive: false,
		participantUserIds: [PLAYER_ID, TEAMMATE_ID],
		permissions: {
			VIEW: [PLAYER_ID, TEAMMATE_ID, ORGANIZER_ID],
			POST: [PLAYER_ID, TEAMMATE_ID, ORGANIZER_ID],
			OBSERVE: [ORGANIZER_ID],
		},
		closedAt: null,
		expiresAt: databaseTimestampNow() + 3600,
		...overrides,
	};
}

const teamRoom = (overrides: Parameters<typeof resolvedRoom>[0] = {}) =>
	resolvedRoom({
		permissions: {
			VIEW: [PLAYER_ID, TEAMMATE_ID, ORGANIZER_ID],
			POST: [PLAYER_ID, TEAMMATE_ID],
			OBSERVE: [ORGANIZER_ID],
		},
		...overrides,
	});

describe("VoiceAccess.featureOf", () => {
	test.each([
		{ type: "SQ_GROUP", isLookingForMembers: false, expected: "SENDOUQ" },
		{ type: "LOBBY_TEAM", isLookingForMembers: false, expected: "LOBBIES" },
		{
			type: "TOURNAMENT_MATCH",
			isLookingForMembers: false,
			expected: "TOURNAMENTS",
		},
		{
			type: "TOURNAMENT_TEAM",
			isLookingForMembers: false,
			expected: "TOURNAMENTS",
		},
		{ type: "TOURNAMENT_TEAM", isLookingForMembers: true, expected: "LFG" },
		{ type: "SCRIM", isLookingForMembers: false, expected: null },
	] as const)(
		"$type looking for members: $isLookingForMembers is $expected",
		({ type, isLookingForMembers, expected }) => {
			expect(VoiceAccess.featureOf({ type, isLookingForMembers })).toBe(
				expected,
			);
		},
	);
});

describe("VoiceAccess.canJoin", () => {
	test.each([
		{
			why: "a participant",
			room: resolvedRoom(),
			userId: PLAYER_ID,
			expected: true,
		},
		{
			why: "an organizer observing a match",
			room: resolvedRoom(),
			userId: ORGANIZER_ID,
			expected: true,
		},
		{
			why: "an organizer observing a team",
			room: teamRoom(),
			userId: ORGANIZER_ID,
			expected: true,
		},
		{
			why: "someone who may not view",
			room: resolvedRoom(),
			userId: OUTSIDER_ID,
			expected: false,
		},
		{
			why: "a finished match",
			room: resolvedRoom({ inactive: true }),
			userId: PLAYER_ID,
			expected: false,
		},
		{
			why: "a solo group",
			room: resolvedRoom({ participantUserIds: [PLAYER_ID] }),
			userId: PLAYER_ID,
			expected: false,
		},
		{
			why: "an observer of an expired room",
			room: teamRoom({ expiresAt: databaseTimestampNow() - 1 }),
			userId: ORGANIZER_ID,
			expected: false,
		},
		{
			why: "an observer of a closed room",
			room: teamRoom({ closedAt: databaseTimestampNow() }),
			userId: ORGANIZER_ID,
			expected: false,
		},
		{
			why: "a scrim, which has no voice chat",
			room: resolvedRoom({ type: "SCRIM" }),
			userId: PLAYER_ID,
			expected: false,
		},
	])("$why: $expected", ({ room, userId, expected }) => {
		expect(VoiceAccess.canJoin(room, userId)).toBe(expected);
	});
});

describe("VoiceAccess.canKick", () => {
	test.each([
		{ why: "an organizer", userId: ORGANIZER_ID, expected: true },
		{ why: "a player", userId: PLAYER_ID, expected: false },
		{ why: "an outsider", userId: OUTSIDER_ID, expected: false },
	])("$why: $expected", ({ userId, expected }) => {
		expect(VoiceAccess.canKick(teamRoom(), userId)).toBe(expected);
	});
});
