import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	markOnAirIfLoaded,
	OBS_TOO_OLD_ID,
	ON_AIR_GUARD_MARKER,
	onAirGuardScript,
} from "./broadcast-on-air";

const WATCHDOG_MS = 15_000;

const fetchPage = vi.fn<typeof fetch>();
let card: HTMLDivElement;

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("fetch", fetchPage);
	card = document.createElement("div");
	card.id = OBS_TOO_OLD_ID;
	card.hidden = true;
	document.body.append(card);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	fetchPage.mockReset();
	card.remove();
	document.documentElement.removeAttribute("data-broadcast-on-air");
});

describe("onAirGuardScript", () => {
	test("shows the card to update OBS in a browser too old for the overlay", async () => {
		withoutToReversed(runGuard);
		await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 4);

		expect(card.hidden).toBe(false);
		expect(fetchPage).not.toHaveBeenCalled();
	});

	test("leaves a page that went on air alone", async () => {
		runGuard();
		markOnAirIfLoaded();
		await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 4);

		expect(card.hidden).toBe(true);
		expect(fetchPage).not.toHaveBeenCalled();
	});

	test.each([
		{
			why: "an error page",
			response: () => new Response("<h1>502 Bad gateway</h1>", { status: 502 }),
		},
		{
			why: "a page of someone else's, e.g. a CDN's challenge",
			response: () => new Response("<h1>Just a moment</h1>", { status: 200 }),
		},
		{
			why: "the app's error page",
			response: () =>
				new Response(`<script ${ON_AIR_GUARD_MARKER}></script>`, {
					status: 500,
				}),
		},
	])(
		"keeps a page not on air while its URL answers $why, asking again with backoff",
		async ({ response }) => {
			fetchPage.mockImplementation(async () => response());
			runGuard();

			await vi.advanceTimersByTimeAsync(WATCHDOG_MS - 1);
			expect(fetchPage).toHaveBeenCalledTimes(0);
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchPage).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(2_000);
			expect(fetchPage).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(4_000);
			expect(fetchPage).toHaveBeenCalledTimes(3);
			expect(fetchPage).toHaveBeenLastCalledWith(window.location.href, {
				cache: "no-store",
			});
		},
	);

	test("asks again when the request fails", async () => {
		fetchPage.mockRejectedValue(new TypeError("Failed to fetch"));
		runGuard();

		await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 2_000);

		expect(fetchPage).toHaveBeenCalledTimes(2);
	});
});

describe("markOnAirIfLoaded", () => {
	test("goes on air once the stylesheets loaded", () => {
		expect(markOnAirIfLoaded()).toBe(true);
		expect(document.documentElement.hasAttribute("data-broadcast-on-air")).toBe(
			true,
		);
	});

	test("stays off air while a stylesheet failed to load", async () => {
		vi.useRealTimers();
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = "/does-not-exist.css";
		const loaded = new Promise((resolve) => {
			link.onload = resolve;
			link.onerror = resolve;
		});
		document.head.append(link);
		await loaded;

		try {
			expect(markOnAirIfLoaded()).toBe(false);
			expect(
				document.documentElement.hasAttribute("data-broadcast-on-air"),
			).toBe(false);
		} finally {
			link.remove();
		}
	});
});

function runGuard() {
	const script = document.createElement("script");
	script.textContent = onAirGuardScript;
	document.body.append(script);
	script.remove();
}

function withoutToReversed(run: () => void) {
	const descriptor = Object.getOwnPropertyDescriptor(
		Array.prototype,
		"toReversed",
	)!;
	// an old browser has no such property at all
	Reflect.deleteProperty(Array.prototype, "toReversed");
	try {
		run();
	} finally {
		// biome-ignore lint/nursery/noExtendNative: puts the browser's own method back
		Object.defineProperty(Array.prototype, "toReversed", descriptor);
	}
}
