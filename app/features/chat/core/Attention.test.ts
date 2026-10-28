import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as Attention from "./Attention";

const IDLE_AFTER_MS = 1_000;
const LAST_ACTIVE_TAB = "last-active-tab";

function fakeEnvironment(storage = new Map<string, string>()) {
	const state = {
		visibilityState: "visible" as DocumentVisibilityState,
		focused: true,
	};
	const document = Object.defineProperties(new EventTarget(), {
		visibilityState: { get: () => state.visibilityState },
		hasFocus: { value: () => state.focused },
	}) as EventTarget & Pick<Document, "visibilityState" | "hasFocus">;
	const window = new EventTarget();

	return {
		environment: {
			document,
			window,
			lastActiveTab: {
				read: () => storage.get(LAST_ACTIVE_TAB) ?? null,
				write: (tabId: string | null) => {
					if (tabId === null) {
						storage.delete(LAST_ACTIVE_TAB);
					} else {
						storage.set(LAST_ACTIVE_TAB, tabId);
					}
				},
			},
			now: () => Date.now(),
		},
		hide: () => {
			state.visibilityState = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		},
		blur: () => {
			state.focused = false;
			window.dispatchEvent(new Event("blur"));
		},
		focus: () => {
			state.focused = true;
			window.dispatchEvent(new Event("focus"));
		},
		useKeyboard: () => window.dispatchEvent(new Event("keydown")),
		close: () => window.dispatchEvent(new Event("pagehide")),
	};
}

function trackerFor(env: ReturnType<typeof fakeEnvironment>) {
	return Attention.createTracker(() => env.environment, {
		idleAfterMs: IDLE_AFTER_MS,
	});
}

describe("Attention.createTracker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("pays attention to a visible, focused tab until the user goes idle", () => {
		const env = fakeEnvironment();
		const tracker = trackerFor(env);
		const listener = vi.fn();
		tracker.subscribe(listener);

		expect(tracker.isAttending()).toBe(true);

		vi.advanceTimersByTime(IDLE_AFTER_MS);
		expect(tracker.isAttending()).toBe(false);

		env.useKeyboard();
		expect(tracker.isAttending()).toBe(true);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	test("input keeps the user from going idle", () => {
		const env = fakeEnvironment();
		const tracker = trackerFor(env);
		tracker.isAttending();

		vi.advanceTimersByTime(IDLE_AFTER_MS - 100);
		env.useKeyboard();
		vi.advanceTimersByTime(IDLE_AFTER_MS - 100);

		expect(tracker.isAttending()).toBe(true);
	});

	test.each([
		{
			why: "hidden",
			leave: (env: ReturnType<typeof fakeEnvironment>) => env.hide(),
		},
		{
			why: "unfocused",
			leave: (env: ReturnType<typeof fakeEnvironment>) => env.blur(),
		},
	])("pays no attention to a $why tab", ({ leave }) => {
		const env = fakeEnvironment();
		const tracker = trackerFor(env);
		tracker.isAttending();

		leave(env);

		expect(tracker.isAttending()).toBe(false);
	});

	test("the tab paid attention to last is the last active one", () => {
		const storage = new Map<string, string>();
		const firstEnv = fakeEnvironment(storage);
		const secondEnv = fakeEnvironment(storage);
		const first = trackerFor(firstEnv);
		const second = trackerFor(secondEnv);

		first.isAttending();
		firstEnv.blur();
		second.isAttending();

		expect(first.isLastActiveTab()).toBe(false);
		expect(second.isLastActiveTab()).toBe(true);

		secondEnv.blur();
		firstEnv.focus();

		expect(first.isLastActiveTab()).toBe(true);
	});

	test("every tab counts as the last active one again once it is closed", () => {
		const storage = new Map<string, string>();
		const firstEnv = fakeEnvironment(storage);
		const secondEnv = fakeEnvironment(storage);
		const first = trackerFor(firstEnv);
		const second = trackerFor(secondEnv);
		secondEnv.blur();
		second.isAttending();
		first.isAttending();
		expect(second.isLastActiveTab()).toBe(false);

		firstEnv.close();

		expect(second.isLastActiveTab()).toBe(true);
	});

	test("closing a background tab keeps the last active one", () => {
		const storage = new Map<string, string>();
		const firstEnv = fakeEnvironment(storage);
		const secondEnv = fakeEnvironment(storage);
		const thirdEnv = fakeEnvironment(storage);
		const first = trackerFor(firstEnv);
		const second = trackerFor(secondEnv);
		const third = trackerFor(thirdEnv);
		secondEnv.blur();
		thirdEnv.blur();
		second.isAttending();
		third.isAttending();
		first.isAttending();

		secondEnv.close();

		expect(first.isLastActiveTab()).toBe(true);
		expect(third.isLastActiveTab()).toBe(false);
	});
});
