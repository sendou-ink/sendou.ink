import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import * as AudioFeeds from "~/features/broadcast/core/AudioFeeds";
import type { BroadcastCaster } from "../broadcast-cast-types";
import { CasterFeedsHealth, CasterMixer } from "./CasterMixer";

const CASTERS: BroadcastCaster[] = [
	caster({ userId: 1, name: "Alpha" }),
	caster({ userId: 2, name: "Bravo" }),
	caster({ userId: 3, name: "Charlie", vdoNinjaUrl: null }),
];

describe("CasterMixer", () => {
	test("shows a fader for each caster with a VDO.ninja link", async () => {
		await renderMixer(AudioFeeds.createStore());

		await expect
			.element(page.getByTestId("broadcast-caster-volume-1"))
			.toHaveValue("80");
		await expect
			.element(page.getByTestId("broadcast-caster-volume-2"))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("broadcast-caster-strip-3"))
			.not.toBeInTheDocument();
	});

	test("shows what OBS hears of each caster", async () => {
		const feedStore = AudioFeeds.createStore();
		feedStore.report("obs", [
			{ id: 1, isConnected: true, loudness: 25 },
			{ id: 2, isConnected: false, loudness: 0 },
		]);

		await renderMixer(feedStore);

		await expect
			.element(page.getByTestId("broadcast-caster-strip-1"))
			.toHaveAttribute("data-status", "connected");
		await expect
			.element(page.getByTestId("broadcast-caster-strip-2"))
			.toHaveAttribute("data-status", "disconnected");
	});

	test("meters the caster at their volume", async () => {
		const feedStore = AudioFeeds.createStore();
		feedStore.report("obs", [{ id: 1, isConnected: true, loudness: 50 }]);

		await renderMixer(feedStore);

		await expect.poll(() => meterLevel(1)).toBeCloseTo((50 * 0.8) / 100);
	});

	test("tells no OBS hears the casters while none reports them", async () => {
		await renderMixer(AudioFeeds.createStore());

		await expect
			.element(page.getByTestId("broadcast-caster-strip-1"))
			.toHaveAttribute("data-status", "unknown");
	});
});

describe("CasterFeedsHealth", () => {
	test("warns of a caster whose stream is down", async () => {
		const feedStore = AudioFeeds.createStore();
		feedStore.report("obs", [
			{ id: 1, isConnected: true, loudness: 0 },
			{ id: 2, isConnected: false, loudness: 0 },
		]);

		await render(
			<CasterFeedsHealth
				casters={CASTERS}
				feedStore={feedStore}
				onClick={() => {}}
			/>,
		);

		await expect
			.element(page.getByTestId("broadcast-casters-disconnected"))
			.toHaveTextContent("Bravo");
	});

	test("warns of nothing once the caster is connected again", async () => {
		const feedStore = AudioFeeds.createStore();
		feedStore.report("obs", [{ id: 2, isConnected: false, loudness: 0 }]);
		await render(
			<CasterFeedsHealth
				casters={CASTERS}
				feedStore={feedStore}
				onClick={() => {}}
			/>,
		);
		await expect
			.element(page.getByTestId("broadcast-casters-disconnected"))
			.toBeInTheDocument();

		feedStore.report("obs", [{ id: 2, isConnected: true, loudness: 0 }]);

		await expect
			.element(page.getByTestId("broadcast-casters-disconnected"))
			.not.toBeInTheDocument();
	});
});

function renderMixer(feedStore: AudioFeeds.Store) {
	const router = createMemoryRouter(
		[
			{
				path: "*",
				element: <CasterMixer casters={CASTERS} feedStore={feedStore} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

function meterLevel(userId: number) {
	return Number(
		page
			.getByTestId(`broadcast-caster-meter-${userId}`)
			.element()
			.style.getPropertyValue("--level"),
	);
}

function caster(overrides: Partial<BroadcastCaster>): BroadcastCaster {
	return {
		userId: 1,
		name: "Caster",
		pronouns: null,
		avatarUrl: null,
		vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
		isAudioOnly: false,
		volume: 80,
		...overrides,
	};
}
