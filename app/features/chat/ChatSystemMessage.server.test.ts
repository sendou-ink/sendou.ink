import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as EventBus from "~/features/events/core/EventBus.server";
import { abortSubscriptions, flushEvents, subscribeTo } from "./tests/fixtures";

process.env.SKALOP_SYSTEM_MESSAGE_URL = "http://skalop.test";
process.env.SKALOP_TOKEN = "test-token";

const ChatSystemMessage = await import("./ChatSystemMessage.server");

const fetchMock = vi.fn(
	async (_input: unknown, _init?: { body?: string }) => new Response(null),
);

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockClear();
	abortSubscriptions();
});

describe("ChatSystemMessage.send", () => {
	test("publishes a revalidate broadcast to its topic channel", async () => {
		const received = subscribeTo("tournament__101");

		ChatSystemMessage.send({
			room: "tournament__101",
			revalidateOnly: true,
			revalidateScope: "MATCH_RESULTS",
			authorUserId: 5,
		});
		await flushEvents();

		expect(received).toEqual([
			{ kind: "revalidate", scope: "MATCH_RESULTS", authorUserId: 5 },
		]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("keeps a sound-carrying type on the broadcast, bypassing the throttle", async () => {
		const received = subscribeTo("sq-group__102");

		ChatSystemMessage.send({
			room: "sq-group__102",
			type: "READY_CHECK_STARTED",
			revalidateOnly: true,
			authorUserId: 5,
		});
		ChatSystemMessage.send({
			room: "sq-group__102",
			type: "READY_CHECK_STARTED",
			revalidateOnly: true,
			authorUserId: 5,
		});
		await flushEvents();

		expect(received).toEqual([
			{ kind: "revalidate", authorUserId: 5, type: "READY_CHECK_STARTED" },
			{ kind: "revalidate", authorUserId: 5, type: "READY_CHECK_STARTED" },
		]);
	});

	test("drops a soundless system message type from the broadcast", async () => {
		const received = subscribeTo("tournament__103");

		ChatSystemMessage.send({
			room: "tournament__103",
			type: "TOURNAMENT_UPDATED",
			revalidateOnly: true,
		});
		await flushEvents();

		expect(received).toEqual([{ kind: "revalidate" }]);
	});

	test("throttles rapid soundless broadcasts to the same topic", async () => {
		const received = subscribeTo("tournament__104");

		ChatSystemMessage.send({ room: "tournament__104", revalidateOnly: true });
		ChatSystemMessage.send({ room: "tournament__104", revalidateOnly: true });
		await flushEvents();

		expect(received).toHaveLength(1);
	});

	test("sends real chat messages to skalop, not the event bus", async () => {
		const received = subscribeTo("someChatCode123");

		ChatSystemMessage.send({
			room: "someChatCode123",
			type: "USER_LEFT",
			context: { name: "Sendou" },
		});
		await flushEvents();

		expect(received).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchMock.mock.calls[0][1]!.body!);
		expect(body.action).toBe("sendMessage");
		expect(body.messages[0].room).toBe("someChatCode123");
	});
});

describe("ChatSystemMessage.notifyNotificationsChanged", () => {
	test("publishes to each user's channel", async () => {
		const alpha = subscribeTo(EventBus.userChannel(1));
		const bravo = subscribeTo(EventBus.userChannel(2));

		ChatSystemMessage.notifyNotificationsChanged([1, 2]);
		await flushEvents();

		expect(alpha).toEqual([{ kind: "notificationsChanged" }]);
		expect(bravo).toEqual([{ kind: "notificationsChanged" }]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
