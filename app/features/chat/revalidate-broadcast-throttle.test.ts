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

	test("does not throttle broadcasts whose sound must not be dropped", () => {
		const { throttle } = setup();

		expect(throttle.throttles({ type: "MATCH_STARTED" })).toBe(false);
		expect(throttle.throttles({ type: "READY_CHECK_STARTED" })).toBe(false);
	});

	test("throttles broadcasts that play no sound", () => {
		const { throttle } = setup();

		expect(throttle.throttles({})).toBe(true);
		expect(throttle.throttles({ type: "SCORE_CONFIRMED" })).toBe(true);
		expect(throttle.throttles({ type: "MAP_REPLAYED" })).toBe(true);
	});

	test("first broadcast of a window is delivered immediately", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ channel: "sq-looking" });

		expect(sendLeading).toHaveBeenCalledTimes(1);
		expect(sendTrailing).not.toHaveBeenCalled();
	});

	test("broadcasts within the window coalesce into one trailing broadcast", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ channel: "sq-looking" });
		vi.advanceTimersByTime(500);
		throttle.handle({ channel: "sq-looking" });
		throttle.handle({ channel: "sq-looking" });
		throttle.handle({ channel: "sq-looking" });

		expect(sendLeading).toHaveBeenCalledTimes(1);
		expect(sendTrailing).not.toHaveBeenCalled();

		vi.advanceTimersByTime(WINDOW_MS - 500);
		expect(sendTrailing).toHaveBeenCalledTimes(1);
		expect(sendTrailing).toHaveBeenCalledWith({
			channel: "sq-looking",
			revalidateScope: undefined,
		});
	});

	test("a broadcast after the window opens a fresh window and sends immediately", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ channel: "sq-looking" });
		vi.advanceTimersByTime(WINDOW_MS);
		throttle.handle({ channel: "sq-looking" });

		expect(sendLeading).toHaveBeenCalledTimes(2);
		expect(sendTrailing).not.toHaveBeenCalled();
	});

	test("rooms are throttled independently", () => {
		const { throttle, sendLeading } = setup();

		throttle.handle({ channel: "sq-looking" });
		throttle.handle({ channel: "tournament-1" });

		expect(sendLeading).toHaveBeenCalledTimes(2);
	});

	test("coalesced broadcasts of one scope keep it, differing scopes widen to unset", () => {
		const { throttle, sendTrailing } = setup();

		throttle.handle({ channel: "tournament-1" });
		throttle.handle({
			channel: "tournament-1",
			revalidateScope: "MATCH_RESULTS",
		});
		throttle.handle({
			channel: "tournament-1",
			revalidateScope: "MATCH_RESULTS",
		});
		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenLastCalledWith({
			channel: "tournament-1",
			revalidateScope: "MATCH_RESULTS",
		});

		throttle.handle({ channel: "tournament-1" });
		throttle.handle({
			channel: "tournament-1",
			revalidateScope: "MATCH_RESULTS",
		});
		throttle.handle({ channel: "tournament-1" });
		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenLastCalledWith({
			channel: "tournament-1",
			revalidateScope: undefined,
		});
	});

	test("forgetting idle rooms spares one whose trailing broadcast is still pending", () => {
		const { throttle, sendLeading, sendTrailing } = setup();
		const startedAt = Date.now();

		for (let i = 0; i <= MAX_ENTRIES; i++) {
			throttle.handle({ channel: `tournament-${i}` });
		}
		throttle.handle({ channel: "sq-looking" });
		throttle.handle({ channel: "sq-looking" });
		sendLeading.mockClear();

		// every room is idle by now, but the trailing broadcast is late rather than sent
		// (its timer would have run at the window's end on a server that was not busy)
		vi.setSystemTime(startedAt + WINDOW_MS + 1_000);
		throttle.handle({ channel: "tournament-late" });
		expect(sendLeading).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenCalledTimes(1);
		expect(sendTrailing).toHaveBeenCalledWith({
			channel: "sq-looking",
			revalidateScope: undefined,
		});
	});

	test("the trailing broadcast starts a new window", () => {
		const { throttle, sendLeading, sendTrailing } = setup();

		throttle.handle({ channel: "sq-looking" });
		vi.advanceTimersByTime(1_000);
		throttle.handle({ channel: "sq-looking" });
		vi.advanceTimersByTime(1_000);
		expect(sendTrailing).toHaveBeenCalledTimes(1);

		// still within the trailing broadcast's window: coalesces again
		vi.advanceTimersByTime(500);
		throttle.handle({ channel: "sq-looking" });
		expect(sendLeading).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(WINDOW_MS);
		expect(sendTrailing).toHaveBeenCalledTimes(2);
	});
});
