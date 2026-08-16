import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	createRevalidateBroadcastThrottle,
	MAX_ENTRIES,
} from "./revalidate-broadcast-throttle";

const WINDOW_MS = 2_000;

const setup = () => {
	const sendLeading = vi.fn();
	const sendTrailing = vi.fn();
	const throttle = createRevalidateBroadcastThrottle({
		windowMs: WINDOW_MS,
		sendLeading,
		sendTrailing,
	});
	return { throttle, sendLeading, sendTrailing };
};

describe("createRevalidateBroadcastThrottle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("throttles revalidation broadcasts but not chat messages", () => {
		const { throttle } = setup();

		expect(throttle.throttles({ revalidateOnly: true })).toBe(true);
		expect(throttle.throttles({})).toBe(false);
	});

	test("does not throttle broadcasts whose sound must not be dropped", () => {
		const { throttle } = setup();

		expect(
			throttle.throttles({ revalidateOnly: true, type: "MATCH_STARTED" }),
		).toBe(false);
		expect(
			throttle.throttles({ revalidateOnly: true, type: "READY_CHECK_STARTED" }),
		).toBe(false);
	});

	test("throttles broadcasts whose type plays no sound", () => {
		const { throttle } = setup();

		expect(
			throttle.throttles({ revalidateOnly: true, type: "TOURNAMENT_UPDATED" }),
		).toBe(true);
		expect(
			throttle.throttles({
				revalidateOnly: true,
				type: "TOURNAMENT_MATCH_UPDATED",
			}),
		).toBe(true);
	});

	test("first broadcast of a window is delivered immediately", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ room: "sq-looking", revalidateOnly: true });

		expect(sendLeading).toHaveBeenCalledTimes(1);
		expect(sendTrailing).not.toHaveBeenCalled();
	});

	test("broadcasts within the window coalesce into one trailing broadcast", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		vi.advanceTimersByTime(500);
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		throttle.handle({ room: "sq-looking", revalidateOnly: true });

		expect(sendLeading).toHaveBeenCalledTimes(1);
		expect(sendTrailing).not.toHaveBeenCalled();

		vi.advanceTimersByTime(WINDOW_MS - 500);
		expect(sendTrailing).toHaveBeenCalledTimes(1);
		expect(sendTrailing).toHaveBeenCalledWith({
			room: "sq-looking",
			revalidateScope: undefined,
		});
	});

	test("a broadcast after the window opens a fresh window and sends immediately", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		vi.advanceTimersByTime(WINDOW_MS);
		throttle.handle({ room: "sq-looking", revalidateOnly: true });

		expect(sendLeading).toHaveBeenCalledTimes(2);
		expect(sendTrailing).not.toHaveBeenCalled();
	});

	test("rooms are throttled independently", () => {
		const { throttle, sendLeading } = setup();

		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		throttle.handle({ room: "tournament-1", revalidateOnly: true });

		expect(sendLeading).toHaveBeenCalledTimes(2);
	});

	test("coalesced broadcasts of one scope keep it, differing scopes widen to unset", () => {
		const { throttle, sendTrailing } = setup();

		throttle.handle({ room: "tournament-1", revalidateOnly: true });
		throttle.handle({
			room: "tournament-1",
			revalidateOnly: true,
			revalidateScope: "MATCH_RESULTS",
		});
		throttle.handle({
			room: "tournament-1",
			revalidateOnly: true,
			revalidateScope: "MATCH_RESULTS",
		});
		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenLastCalledWith({
			room: "tournament-1",
			revalidateScope: "MATCH_RESULTS",
		});

		throttle.handle({ room: "tournament-1", revalidateOnly: true });
		throttle.handle({
			room: "tournament-1",
			revalidateOnly: true,
			revalidateScope: "MATCH_RESULTS",
		});
		throttle.handle({ room: "tournament-1", revalidateOnly: true });
		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenLastCalledWith({
			room: "tournament-1",
			revalidateScope: undefined,
		});
	});

	test("forgetting idle rooms spares one whose trailing broadcast is still pending", () => {
		const { throttle, sendLeading, sendTrailing } = setup();
		const startedAt = Date.now();

		for (let i = 0; i <= MAX_ENTRIES; i++) {
			throttle.handle({ room: `tournament-${i}`, revalidateOnly: true });
		}
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		sendLeading.mockClear();

		// every room is idle by now, but the trailing broadcast is late rather than sent
		// (its timer would have run at the window's end on a server that was not busy)
		vi.setSystemTime(startedAt + WINDOW_MS + 1_000);
		throttle.handle({ room: "tournament-late", revalidateOnly: true });
		expect(sendLeading).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenCalledTimes(1);
		expect(sendTrailing).toHaveBeenCalledWith({
			room: "sq-looking",
			revalidateScope: undefined,
		});
	});

	test("the trailing broadcast starts a new window", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		vi.advanceTimersByTime(1_000);
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		vi.advanceTimersByTime(1_000);
		expect(sendTrailing).toHaveBeenCalledTimes(1);

		// still within the trailing broadcast's window: coalesces again
		vi.advanceTimersByTime(500);
		throttle.handle({ room: "sq-looking", revalidateOnly: true });
		expect(sendLeading).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenCalledTimes(2);
	});
});
