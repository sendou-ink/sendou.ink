import { beforeEach, describe, expect, test } from "vitest";
import * as NotificationFactory from "~/db/seed/factories/NotificationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as NotificationRepository from "./NotificationRepository.server";

const users = UserFactory.pool();

describe("markAsSeenByType", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const seenStatusOf = async (userId: number) => {
		const notifications = await NotificationRepository.findByUserId(userId);
		return notifications.map(({ type, seen }) => ({ type, seen }));
	};

	test("marks unseen notification of the type as seen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});

	test("leaves other users' notifications unseen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }, { userId: users.id(2) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(2))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 0 },
		]);
	});

	test("leaves notifications of other types unseen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_NEW_MATCH", seen: 0 },
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});

	test("meta filter only matches notifications with the given values", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 2 } },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_NEW_MATCH",
			meta: { matchId: 2 },
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_NEW_MATCH", seen: 1 },
			{ type: "SQ_NEW_MATCH", seen: 0 },
		]);
	});

	test("matches on a subset of meta keys, both string and number valued", async () => {
		await NotificationFactory.create({
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "alice", scrimPostId: 7 },
			},
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "bob", scrimPostId: 7 },
			},
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SCRIM_NEW_REQUEST",
			meta: { fromUsername: "alice" },
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SCRIM_NEW_REQUEST", seen: 0 },
			{ type: "SCRIM_NEW_REQUEST", seen: 1 },
		]);
	});

	test("marks the notification as seen for every given user", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [
				{ userId: users.id(1) },
				{ userId: users.id(2) },
				{ userId: users.id(3) },
			],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1), users.id(3)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
		expect(await seenStatusOf(users.id(2))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 0 },
		]);
		expect(await seenStatusOf(users.id(3))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});
});
