import { beforeEach, describe, expect, test, vi } from "vitest";
import { userIsBanned } from "~/features/ban/core/banned.server";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as VoiceRepository from "../VoiceRepository.server";
import * as VoiceAvailability from "./VoiceAvailability.server";
import * as VoiceJoin from "./VoiceJoin.server";

vi.mock("~/features/ban/core/banned.server", () => ({
	userIsBanned: vi.fn(() => false),
}));
vi.mock("../VoiceRepository.server", () => ({
	hasBeenKicked: vi.fn(async () => false),
}));
vi.mock("./VoiceAvailability.server", () => ({
	isAvailable: vi.fn(async () => true),
}));

const PLAYER_ID = 1;
const TEAMMATE_ID = 2;
const OUTSIDER_ID = 3;

beforeEach(() => {
	vi.mocked(userIsBanned).mockReturnValue(false);
	vi.mocked(VoiceRepository.hasBeenKicked).mockResolvedValue(false);
	vi.mocked(VoiceAvailability.isAvailable).mockResolvedValue(true);
});

describe("VoiceJoin.joinBlock", () => {
	test("lets a participant of an available room join", async () => {
		expect(await VoiceJoin.joinBlock(room(), PLAYER_ID)).toBeNull();
	});

	test.each([
		{
			why: "not a participant",
			setup: () => {},
			userId: OUTSIDER_ID,
			expected: "NO_ACCESS",
		},
		{
			why: "banned",
			setup: () => vi.mocked(userIsBanned).mockReturnValue(true),
			userId: PLAYER_ID,
			expected: "BANNED",
		},
		{
			why: "kicked",
			setup: () =>
				vi.mocked(VoiceRepository.hasBeenKicked).mockResolvedValue(true),
			userId: PLAYER_ID,
			expected: "KICKED",
		},
		{
			why: "voice unavailable",
			setup: () =>
				vi.mocked(VoiceAvailability.isAvailable).mockResolvedValue(false),
			userId: PLAYER_ID,
			expected: "UNAVAILABLE",
		},
	])("blocks when $why", async ({ setup, userId, expected }) => {
		setup();

		expect(await VoiceJoin.joinBlock(room(), userId)).toBe(expected);
	});

	test("an access block wins over voice being unavailable", async () => {
		vi.mocked(VoiceRepository.hasBeenKicked).mockResolvedValue(true);
		vi.mocked(VoiceAvailability.isAvailable).mockResolvedValue(false);

		expect(await VoiceJoin.joinBlock(room(), PLAYER_ID)).toBe("KICKED");
	});

	test("blocks a room type without voice", async () => {
		expect(await VoiceJoin.joinBlock(room({ type: "SCRIM" }), PLAYER_ID)).toBe(
			"NO_ACCESS",
		);
	});
});

function room(overrides: Partial<ResolvedRoom> = {}): ResolvedRoom {
	return {
		roomId: 1,
		type: "SQ_MATCH",
		titleParams: {},
		url: "/",
		imageUrl: null,
		participantUserIds: [PLAYER_ID, TEAMMATE_ID],
		labelByUserId: {},
		permissions: {
			VIEW: [PLAYER_ID, TEAMMATE_ID],
			POST: [PLAYER_ID, TEAMMATE_ID],
			OBSERVE: [],
		},
		expiresAt: databaseTimestampNow() + 3600,
		closedAt: null,
		inactive: false,
		isLookingForMembers: false,
		...overrides,
	};
}
