import { beforeEach, describe, expect, test } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TopicAccess from "./TopicAccess.server";

const users = UserFactory.pool();

// ADMIN_ID is 1 under NODE_ENV=test, so the first pool user is site staff
const adminId = () => users.id(1);
const memberId = () => users.id(2);
const outsiderId = () => users.id(4);

describe("TopicAccess.canSubscribeToAll", () => {
	test.each([
		{ topic: "sq-looking", allowed: true },
		{ topic: "tournament__5", allowed: true },
		{ topic: "match__123", allowed: true },
		{ topic: "sq-group__7", allowed: true },
		{ topic: "user__5", allowed: false },
		{ topic: "chat-room__abc", allowed: false },
		{ topic: "chat-room__999", allowed: false },
		{ topic: "unknown-topic", allowed: false },
	])("$topic -> $allowed", async ({ topic, allowed }) => {
		expect(await TopicAccess.canSubscribeToAll(1, [topic])).toBe(allowed);
	});

	describe("chat room topics", () => {
		beforeEach(async () => {
			await users.create(4);
		});

		const setupGroupRoom = async () => {
			const group = await SQGroupFactory.create({
				memberUserIds: [memberId(), users.id(3)],
			});
			const { chatRoomId } = await db
				.selectFrom("Group")
				.select("Group.chatRoomId")
				.where("Group.id", "=", group.id)
				.executeTakeFirstOrThrow();

			return `chat-room__${chatRoomId}`;
		};

		test("participants may subscribe to their room", async () => {
			const topic = await setupGroupRoom();

			expect(await TopicAccess.canSubscribeToAll(memberId(), [topic])).toBe(
				true,
			);
		});

		test("site staff may subscribe as observers", async () => {
			const topic = await setupGroupRoom();

			expect(await TopicAccess.canSubscribeToAll(adminId(), [topic])).toBe(
				true,
			);
		});

		test("other users may not subscribe", async () => {
			const topic = await setupGroupRoom();

			expect(await TopicAccess.canSubscribeToAll(outsiderId(), [topic])).toBe(
				false,
			);
		});

		test("one forbidden topic denies the whole batch", async () => {
			const topic = await setupGroupRoom();

			expect(
				await TopicAccess.canSubscribeToAll(memberId(), [
					topic,
					"tournament__5",
					"chat-room__999",
				]),
			).toBe(false);
		});
	});
});
