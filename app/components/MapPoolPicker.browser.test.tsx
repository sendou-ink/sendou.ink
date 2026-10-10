import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import { MapPoolPicker } from "./MapPoolPicker";

const LEGAL_PAIR = {
	mode: "TC",
	stageId: stagesObj.HAGGLEFISH_MARKET,
} as const;
const ILLEGAL_PAIR = { mode: "TC", stageId: stagesObj.WAHOO_WORLD } as const;

function renderPicker(initialMapPool: MapPool) {
	const onChange = vi.fn<(mapPool: MapPool) => void>();

	function Harness() {
		const [mapPool, setMapPool] = React.useState(initialMapPool);

		return (
			<MapPoolPicker
				mapPool={mapPool}
				onChange={(newMapPool) => {
					onChange(newMapPool);
					setMapPool(newMapPool);
				}}
				modes={["TC"]}
				sendouQFilter
			/>
		);
	}

	const router = createMemoryRouter([{ path: "*", element: <Harness /> }], {
		initialEntries: ["/"],
	});

	return { onChange, rendered: render(<RouterProvider router={router} />) };
}

const SENDOUQ_SWITCH_LABEL = "Show only SendouQ legal stages";

const sendouQSwitch = () =>
	page.getByRole("switch", { name: SENDOUQ_SWITCH_LABEL });

// the switch's input is visually hidden, a user clicks its label
const toggleSendouQSwitch = () => page.getByText(SENDOUQ_SWITCH_LABEL).click();

const stageCheckbox = (name: string) => page.getByRole("checkbox", { name });

describe("MapPoolPicker", () => {
	test("hides stages that are not legal in SendouQ when the toggle is on", async () => {
		await renderPicker(MapPool.EMPTY).rendered;

		await expect.element(stageCheckbox("Wahoo World")).toBeInTheDocument();

		await toggleSendouQSwitch();

		await expect.element(sendouQSwitch()).toBeChecked();
		await expect.element(stageCheckbox("Wahoo World")).not.toBeInTheDocument();
		await expect
			.element(stageCheckbox("Hagglefish Market"))
			.toBeInTheDocument();
	});

	test("turns on without confirming when every picked stage is legal in SendouQ", async () => {
		const { onChange, rendered } = renderPicker(new MapPool([LEGAL_PAIR]));
		await rendered;

		await toggleSendouQSwitch();

		await expect.element(sendouQSwitch()).toBeChecked();
		expect(document.querySelector("dialog")).toBeNull();
		expect(onChange.mock.lastCall?.[0].stageModePairs).toEqual([LEGAL_PAIR]);
	});

	test("removes picked stages that are not legal in SendouQ after confirming", async () => {
		const { onChange, rendered } = renderPicker(
			new MapPool([LEGAL_PAIR, ILLEGAL_PAIR]),
		);
		await rendered;

		await toggleSendouQSwitch();

		await expect.element(page.getByText("TC Wahoo World")).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();

		await page.getByRole("button", { name: "Remove" }).click();

		await expect.element(sendouQSwitch()).toBeChecked();
		expect(onChange.mock.lastCall?.[0].stageModePairs).toEqual([LEGAL_PAIR]);
	});

	test("keeps the map pool and the toggle off when the confirm is dismissed", async () => {
		const { onChange, rendered } = renderPicker(new MapPool([ILLEGAL_PAIR]));
		await rendered;

		await toggleSendouQSwitch();
		await expect
			.element(page.getByRole("button", { name: "Remove" }))
			.toBeVisible();

		await userEvent.keyboard("{Escape}");

		await expect
			.element(page.getByRole("button", { name: "Remove" }))
			.not.toBeInTheDocument();
		await expect.element(sendouQSwitch()).not.toBeChecked();
		await expect.element(stageCheckbox("Wahoo World")).toBeChecked();
		expect(onChange).not.toHaveBeenCalled();
	});
});
