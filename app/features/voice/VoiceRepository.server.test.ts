import { subDays, subMinutes } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
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
	await users.create(2);
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

describe("VoiceRepository.markOwnSessionLeft", () => {
	test("does not overwrite a kick", async () => {
		const room = await ChatRoomFactory.create();
		const session = await VoiceSessionFactory.create(
			{ userId: playerId(), roomId: room.id },
			{ dailySessionId: "daily-1" },
		);
		await VoiceRepository.markSessionsKicked({
			roomId: room.id,
			userId: playerId(),
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
