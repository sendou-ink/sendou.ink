import { describe, expect, test, vi } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
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

	render(<RouterProvider router={router} />);

	return { onChange };
}

const SENDOUQ_SWITCH_LABEL = "Show only SendouQ legal stages";

const sendouQSwitch = () =>
	screen.getByRole("switch", { name: SENDOUQ_SWITCH_LABEL });

// the switch's input is visually hidden, a user clicks its label
const toggleSendouQSwitch = async () =>
	userEvent.click(await screen.findByText(SENDOUQ_SWITCH_LABEL));

const stageCheckbox = (name: string) =>
	screen.queryByRole("checkbox", { name });

describe("MapPoolPicker", () => {
	test("hides stages that are not legal in SendouQ when the toggle is on", async () => {
		renderPicker(MapPool.EMPTY);

		expect(
			await screen.findByRole("checkbox", { name: "Wahoo World" }),
		).toBeInTheDocument();

		await toggleSendouQSwitch();

		expect(sendouQSwitch()).toBeChecked();
		expect(stageCheckbox("Wahoo World")).not.toBeInTheDocument();
		expect(stageCheckbox("Hagglefish Market")).toBeInTheDocument();
	});

	test("turns on without confirming when every picked stage is legal in SendouQ", async () => {
		const { onChange } = renderPicker(new MapPool([LEGAL_PAIR]));

		await toggleSendouQSwitch();

		expect(sendouQSwitch()).toBeChecked();
		expect(document.querySelector("dialog")).toBeNull();
		expect(onChange.mock.lastCall?.[0].stageModePairs).toEqual([LEGAL_PAIR]);
	});

	test("removes picked stages that are not legal in SendouQ after confirming", async () => {
		const { onChange } = renderPicker(new MapPool([LEGAL_PAIR, ILLEGAL_PAIR]));

		await toggleSendouQSwitch();

		expect(await screen.findByText("TC Wahoo World")).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole("button", { name: "Remove" }));

		await waitFor(() => expect(sendouQSwitch()).toBeChecked());
		expect(onChange.mock.lastCall?.[0].stageModePairs).toEqual([LEGAL_PAIR]);
	});
});
