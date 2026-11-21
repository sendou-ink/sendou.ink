import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as AudioFeeds from "./AudioFeeds";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("AudioFeeds.createStore", () => {
	test("keeps the latest feeds an overlay reported", () => {
		const store = AudioFeeds.createStore();

		store.report("obs", [{ id: 1, isConnected: true, loudness: 30 }]);
		store.report("obs", [{ id: 1, isConnected: false, loudness: 0 }]);

		expect(store.getSnapshot().get(1)).toEqual({
			id: 1,
			isConnected: false,
			loudness: 0,
		});
	});

	test("hears a feed connected when any overlay does, as loud as the loudest", () => {
		const store = AudioFeeds.createStore();

		store.report("obs", [{ id: 1, isConnected: false, loudness: 10 }]);
		store.report("other-obs", [{ id: 1, isConnected: true, loudness: 5 }]);

		expect(store.getSnapshot().get(1)).toEqual({
			id: 1,
			isConnected: true,
			loudness: 10,
		});
	});

	test("forgets an overlay once it's gone", () => {
		const store = AudioFeeds.createStore();
		store.report("obs", [{ id: 1, isConnected: true, loudness: 10 }]);

		store.report("obs", null);

		expect(store.getSnapshot().size).toBe(0);
	});

	test("forgets an overlay that stopped reporting", () => {
		const store = AudioFeeds.createStore();
		const listener = vi.fn();
		store.subscribe(listener);
		store.report("obs", [{ id: 1, isConnected: true, loudness: 10 }]);
		listener.mockClear();

		vi.advanceTimersByTime(3_000);

		expect(store.getSnapshot().size).toBe(0);
		expect(listener).toHaveBeenCalled();
	});

	test("tells the listeners of every report", () => {
		const store = AudioFeeds.createStore();
		const listener = vi.fn();
		store.subscribe(listener);

		store.report("obs", [{ id: 1, isConnected: true, loudness: 10 }]);

		expect(listener).toHaveBeenCalledOnce();
	});
});
