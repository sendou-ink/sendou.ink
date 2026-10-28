import { beforeEach, describe, expect, test } from "bun:test";
import { subDays, subMinutes } from "date-fns";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VoiceSessionFactory from "~/db/seed/factories/VoiceSessionFactory";
import { db } from "~/db/sql";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as VoiceRepository from "./VoiceRepository.server";

const users = UserFactory.pool();
const playerId = () => users.id(1);
const otherPlayerId = () => users.id(2);

beforeEach(async () => {
	await users.create(8);
});

const sessionRow = (id: number) =>
	db
		.selectFrom("VoiceSession")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirstOrThrow();

describe("VoiceRepository.sumParticipantMinutesSince", () => {
	const monthStart = () => dateToDatabaseTimestamp(subDays(new Date(), 7));

	test("counts Daily's billed duration over the reported times", async () => {
		await VoiceSessionFactory.create(
			{ userId: playerId() },
			{ dailySessionId: "daily-1", connectedAt: subMinutes(new Date(), 30) },
		);
		await VoiceRepository.updateFromLeftWebhook({
			dailySessionId: "daily-1",
			durationSeconds: 600,
			networkQualityState: "good",
			leftAt: databaseTimestampNow(),
		});

		expect(await VoiceRepository.sumParticipantMinutesSince(monthStart())).toBe(
			10,
		);
	});

	test("counts an ongoing session up to now", async () => {
		await VoiceSessionFactory.create(
			{ userId: playerId() },
			{ dailySessionId: "daily-1", connectedAt: subMinutes(new Date(), 20) },
		);

		expect(
			await VoiceRepository.sumParticipantMinutesSince(monthStart()),
		).toBeCloseTo(20, 0);
	});

	test("ignores sessions that never connected and sessions before the timestamp", async () => {
		await VoiceSessionFactory.create({ userId: playerId() });
		await VoiceSessionFactory.create(
			{ userId: otherPlayerId() },
			{
				dailySessionId: "daily-old",
				createdAt: subDays(new Date(), 10),
				connectedAt: subDays(new Date(), 10),
			},
		);

		expect(await VoiceRepository.sumParticipantMinutesSince(monthStart())).toBe(
			0,
		);
	});
});

describe("VoiceRepository.updateFromLeftWebhook", () => {
	test("keeps the leave the client reported while taking Daily's duration", async () => {
		const session = await VoiceSessionFactory.create(
			{ userId: playerId() },
			{ dailySessionId: "daily-1" },
		);
		await withUserId(playerId(), () =>
			VoiceRepository.markOwnSessionLeft({
				id: session.id,
				leaveReason: "LEFT",
			}),
		);
		const { leftAt } = await sessionRow(session.id);

		await VoiceRepository.updateFromLeftWebhook({
			dailySessionId: "daily-1",
			durationSeconds: 90,
			networkQualityState: "warning",
			leftAt: databaseTimestampNow() + 60,
		});

		expect(await sessionRow(session.id)).toMatchObject({
			leftAt,
			leaveReason: "LEFT",
			durationSeconds: 90,
			networkQualityState: "warning",
		});
	});

	test("ends a session the client never reported leaving as ejected", async () => {
		const session = await VoiceSessionFactory.create(
			{ userId: playerId() },
			{ dailySessionId: "daily-1" },
		);

		await VoiceRepository.updateFromLeftWebhook({
			dailySessionId: "daily-1",
			durationSeconds: 90,
			networkQualityState: "good",
			leftAt: 1_800_000_000,
		});

		expect(await sessionRow(session.id)).toMatchObject({
			leftAt: 1_800_000_000,
			leaveReason: "EJECTED",
		});
	});
});

describe("VoiceRepository.insertOwnSession", () => {
	test("ends the user's other open sessions so they stop counting toward the budget", async () => {
		const previous = await VoiceSessionFactory.create(
			{ userId: playerId() },
			{ dailySessionId: "daily-1", connectedAt: subMinutes(new Date(), 30) },
		);
		const othersSession = await VoiceSessionFactory.create(
			{ userId: otherPlayerId() },
			{ dailySessionId: "daily-2" },
		);

		const id = await withUserId(playerId(), () =>
			VoiceRepository.insertOwnSession({
				roomId: null,
				roomType: "SQ_MATCH",
				platform: "DESKTOP",
				eligibleMemberCount: 8,
				vcPreference: "YES",
			}),
		);

		expect((await sessionRow(previous.id)).leaveReason).toBe("REPLACED");
		expect((await sessionRow(othersSession.id)).leftAt).toBeNull();
		expect((await sessionRow(id)).leftAt).toBeNull();
	});
});

describe("VoiceRepository.markOwnSessionLeft", () => {
	test("does not overwrite a kick", async () => {
		const room = await ChatRoomFactory.create();
		const session = await VoiceSessionFactory.create(
			{ userId: playerId(), roomId: room.id },
			{ dailySessionId: "daily-1" },
		);
		await VoiceRepository.markSessionsLeft({
			roomId: room.id,
			userIds: [playerId()],
			leaveReason: "KICKED",
		});

		await withUserId(playerId(), () =>
			VoiceRepository.markOwnSessionLeft({
				id: session.id,
				leaveReason: "CONNECTION_LOST",
			}),
		);

		expect((await sessionRow(session.id)).leaveReason).toBe("KICKED");
	});

	test("only ends the acting user's own session", async () => {
		const session = await VoiceSessionFactory.create({ userId: playerId() });

		await withUserId(otherPlayerId(), () =>
			VoiceRepository.markOwnSessionLeft({
				id: session.id,
				leaveReason: "LEFT",
			}),
		);

		expect((await sessionRow(session.id)).leftAt).toBeNull();
	});
});

describe("VoiceRepository.hasBeenKicked", () => {
	test("holds only for the kicked user in the room they were kicked from", async () => {
		const room = await ChatRoomFactory.create();
		const otherRoom = await ChatRoomFactory.create();
		await VoiceSessionFactory.create(
			{ userId: playerId(), roomId: room.id },
			{ dailySessionId: "daily-1" },
		);
		await VoiceSessionFactory.create(
			{ userId: otherPlayerId(), roomId: room.id },
			{ dailySessionId: "daily-2" },
		);
		await VoiceRepository.markSessionsLeft({
			roomId: room.id,
			userIds: [playerId()],
			leaveReason: "KICKED",
		});

		expect(
			await VoiceRepository.hasBeenKicked({
				roomId: room.id,
				userId: playerId(),
			}),
		).toBe(true);
		expect(
			await VoiceRepository.hasBeenKicked({
				roomId: room.id,
				userId: otherPlayerId(),
			}),
		).toBe(false);
		expect(
			await VoiceRepository.hasBeenKicked({
				roomId: otherRoom.id,
				userId: playerId(),
			}),
		).toBe(false);
	});
});

describe("VoiceRepository.hasOtherConnectedSession", () => {
	test("holds for the old connection of a user who rejoined, not for the new one", async () => {
		const room = await ChatRoomFactory.create();
		await VoiceSessionFactory.create(
			{ userId: playerId(), roomId: room.id },
			{ dailySessionId: "daily-old" },
		);
		await VoiceSessionFactory.create(
			{ userId: playerId(), roomId: room.id },
			{ dailySessionId: "daily-new" },
		);

		const hasOtherThan = (dailySessionId: string) =>
			VoiceRepository.hasOtherConnectedSession({
				roomId: room.id,
				userId: playerId(),
				dailySessionId,
			});

		expect(await hasOtherThan("daily-old")).toBe(true);
		expect(await hasOtherThan("daily-new")).toBe(false);
	});
});

describe("VoiceRepository.findPlayerAdoptionSince", () => {
	test("splits the players of new matches by voice chat setting and counts who connected", async () => {
		const match = await createMatchWithVoiceChatSettings();
		await connect(match.chatRoomId, users.id(1));
		await connect(match.chatRoomId, users.id(2));
		await VoiceSessionFactory.create({
			userId: users.id(5),
			roomId: match.chatRoomId,
		});

		const rows = await VoiceRepository.findPlayerAdoptionSince(weekAgo());

		expect(
			rows
				.filter((row) => row.roomType === "SQ_MATCH")
				.map(({ vc, playerCount, connectedCount }) => ({
					vc,
					playerCount,
					connectedCount,
				})),
		).toEqual(
			expect.arrayContaining([
				{ vc: "YES", playerCount: 6, connectedCount: 1 },
				{ vc: "LISTEN_ONLY", playerCount: 1, connectedCount: 1 },
				{ vc: "NO", playerCount: 1, connectedCount: 0 },
			]),
		);
	});
});

describe("VoiceRepository.findDailyAdoptionSince", () => {
	test("counts rooms where two or more people connected apart from rooms with voice", async () => {
		const conversation = await createMatchWithVoiceChatSettings({
			isConcluded: true,
		});
		await connect(conversation.chatRoomId, users.id(1));
		await connect(conversation.chatRoomId, users.id(2));
		const alone = await createMatchWithVoiceChatSettings();
		await connect(alone.chatRoomId, users.id(1));

		const rows = await VoiceRepository.findDailyAdoptionSince(weekAgo());
		const matchRow = rows.find((row) => row.type === "SQ_MATCH");

		expect(matchRow).toMatchObject({
			roomCount: 2,
			voiceRoomCount: 2,
			conversationRoomCount: 1,
		});
	});
});

const weekAgo = () => dateToDatabaseTimestamp(subDays(new Date(), 7));

async function createMatchWithVoiceChatSettings(
	options: { isConcluded?: boolean } = {},
) {
	for (const userId of users.ids()) {
		await UserFactory.grant(userId, {
			matchProfile: {
				vc:
					userId === users.id(2)
						? "LISTEN_ONLY"
						: userId === users.id(3)
							? "NO"
							: "YES",
			},
		});
	}
	const match = await SQMatchFactory.create(
		{
			alphaUserIds: users.ids(4),
			bravoUserIds: users.ids().slice(4),
		},
		options,
	);

	return { chatRoomId: match.chatRoomId };
}

function connect(roomId: number | null, userId: number) {
	return VoiceSessionFactory.create(
		{ userId, roomId },
		{ dailySessionId: crypto.randomUUID() },
	);
}
