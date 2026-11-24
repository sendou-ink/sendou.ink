import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DEFAULT_CAST_BROADCAST_SETTINGS } from "../broadcast-cast-constants";
import { broadcastDesignSearchParams } from "../broadcast-cast-search-params";
import type { CastBroadcastState } from "../broadcast-cast-types";
import * as DesignScenario from "../core/DesignScenario";
import { TakeButton } from "./TakeButton";

type StatePatch = Partial<
	Pick<CastBroadcastState, "takenAt" | "takenBy" | "takeId">
>;

let takes: FormData[] = [];
/** Pushes a new state to the rendered button, as the broadcast's stream does. */
let pushState: (patch: StatePatch) => void = () => {};

beforeEach(() => {
	takes = [];
});

describe("TakeButton", () => {
	test("takes once while Enter is held on it", async () => {
		await renderButton(stateOf({ takenAt: Date.now() - 60_000 }));
		takeButton().element().focus();

		await userEvent.keyboard("{Enter>8}");
		await userEvent.keyboard("{/Enter}");

		await vi.waitFor(() => expect(takes).toHaveLength(1));
		await settle();
		expect(takes).toHaveLength(1);
	});

	test("ignores a press right after Next went on air by itself", async () => {
		await renderButton(
			stateOf({ takenAt: Date.now(), takenBy: "timer", takeId: 4 }),
		);

		await takeButton().click();

		await settle();
		expect(takes).toHaveLength(0);
	});

	test("takes once the moment after Next went on air by itself has passed", async () => {
		await renderButton(
			stateOf({ takenAt: Date.now() - 2_000, takenBy: "timer", takeId: 4 }),
		);

		await takeButton().click();

		await vi.waitFor(() => expect(takes).toHaveLength(1));
		expect(takes[0]?.get("takeId")).toBe("4");
	});
});

describe("TakeButton as Takes arrive", () => {
	test.each([
		{ why: "by itself", takenBy: "timer" },
		{ why: "by another producer", takenBy: "producer" },
	] as const)(
		"ignores a press right after Next went on air $why",
		async ({ takenBy }) => {
			await renderButton(stateOf({ takenAt: Date.now() - 60_000, takeId: 4 }));

			pushState({ takeId: 5, takenAt: Date.now(), takenBy });
			await takeButton().click();

			await settle();
			expect(takes).toHaveLength(0);
		},
	);

	test("takes again right after its own Take arrived", async () => {
		await renderButton(stateOf({ takenAt: Date.now() - 60_000, takeId: 4 }));
		await takeButton().click();
		await vi.waitFor(() => expect(takes).toHaveLength(1));

		pushState({ takeId: 5, takenAt: Date.now(), takenBy: "producer" });
		await takeButton().click();

		await vi.waitFor(() => expect(takes).toHaveLength(2));
		expect(takes[1]?.get("takeId")).toBe("5");
	});

	test("ignores a press right after Next went on air by itself as its own press was refused", async () => {
		await renderButton(stateOf({ takenAt: Date.now() - 60_000, takeId: 4 }));
		await takeButton().click();
		await vi.waitFor(() => expect(takes).toHaveLength(1));

		pushState({ takeId: 5, takenAt: Date.now(), takenBy: "timer" });
		await takeButton().click();

		await settle();
		expect(takes).toHaveLength(1);
	});
});

function takeButton() {
	return page.getByTestId("broadcast-take-button");
}

function settle() {
	return new Promise((resolve) => setTimeout(resolve, 300));
}

async function renderButton(state: CastBroadcastState) {
	const router = createMemoryRouter([
		{
			path: "/",
			element: <Harness initialState={state} />,
			action: async ({ request }) => {
				// biome-ignore lint/plugin: stub action standing in for the dashboard's, recording the Takes posted
				const formData = await request.formData();
				if (formData.get("_action") === "TAKE") takes.push(formData);
				return null;
			},
		},
	]);

	await render(<RouterProvider router={router} />);
}

function Harness({ initialState }: { initialState: CastBroadcastState }) {
	const [state, setState] = React.useState(initialState);
	pushState = (patch) => setState((current) => ({ ...current, ...patch }));

	return <TakeButton state={state} canTake clockOffsetMs={0} />;
}

function stateOf(patch: StatePatch = {}): CastBroadcastState {
	const state = DesignScenario.build({
		scenario: broadcastDesignSearchParams.parse(new URLSearchParams()),
		tournament: {
			name: "In The Zone",
			logoUrl: "/logo.png",
			organizationName: "Sendou.ink",
		},
		settings: DEFAULT_CAST_BROADCAST_SETTINGS,
		takenAt: Date.now(),
	});

	return { ...state, takenBy: "producer", ...patch };
}
