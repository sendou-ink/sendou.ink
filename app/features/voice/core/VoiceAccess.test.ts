import { describe, expect, test } from "vitest";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import * as VoiceAccess from "./VoiceAccess";

const PLAYER_ID = 1;
const TEAMMATE_ID = 2;
const STAFF_ID = 3;
const OUTSIDER_ID = 4;

function resolvedRoom(overrides: Partial<ResolvedRoom> = {}) {
	return {
		type: "SQ_MATCH" as const,
		inactive: false,
		participantUserIds: [PLAYER_ID, TEAMMATE_ID],
		permissions: {
			VIEW: [PLAYER_ID, TEAMMATE_ID, STAFF_ID],
			POST: [PLAYER_ID, TEAMMATE_ID, STAFF_ID],
			OBSERVE: [STAFF_ID],
		},
		...overrides,
	};
}

describe("VoiceAccess.canJoin", () => {
	test.each([
		{
			why: "a participant of a SendouQ match",
			room: resolvedRoom(),
			userId: PLAYER_ID,
			expected: true,
		},
		{
			why: "staff observing a SendouQ match",
			room: resolvedRoom(),
			userId: STAFF_ID,
			expected: true,
		},
		{
			why: "someone who may not post",
			room: resolvedRoom(),
			userId: OUTSIDER_ID,
			expected: false,
		},
		{
			why: "a SendouQ group member",
			room: resolvedRoom({
				type: "SQ_GROUP",
				permissions: {
					VIEW: [PLAYER_ID, TEAMMATE_ID, STAFF_ID],
					POST: [PLAYER_ID, TEAMMATE_ID],
					OBSERVE: [STAFF_ID],
				},
			}),
			userId: PLAYER_ID,
			expected: true,
		},
		{
			why: "staff observing a private SendouQ group",
			room: resolvedRoom({
				type: "SQ_GROUP",
				permissions: {
					VIEW: [PLAYER_ID, TEAMMATE_ID, STAFF_ID],
					POST: [PLAYER_ID, TEAMMATE_ID],
					OBSERVE: [STAFF_ID],
				},
			}),
			userId: STAFF_ID,
			expected: false,
		},
		{
			why: "a tournament match",
			room: resolvedRoom({ type: "TOURNAMENT_MATCH" }),
			userId: PLAYER_ID,
			expected: false,
		},
		{
			why: "a scrim",
			room: resolvedRoom({ type: "SCRIM" }),
			userId: PLAYER_ID,
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
			room: resolvedRoom({ type: "SQ_GROUP", participantUserIds: [PLAYER_ID] }),
			userId: PLAYER_ID,
			expected: false,
		},
	])("$why: $expected", ({ room, userId, expected }) => {
		expect(VoiceAccess.canJoin(room, userId)).toBe(expected);
	});
});

describe("VoiceAccess.canKick", () => {
	test.each([
		{ why: "staff in a SendouQ match", userId: STAFF_ID, expected: true },
		{ why: "a player", userId: PLAYER_ID, expected: false },
		{ why: "an outsider", userId: OUTSIDER_ID, expected: false },
	])("$why: $expected", ({ userId, expected }) => {
		expect(VoiceAccess.canKick(resolvedRoom(), userId)).toBe(expected);
	});
});
