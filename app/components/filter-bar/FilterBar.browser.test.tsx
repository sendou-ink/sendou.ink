import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouButton } from "../elements/Button";
import { FilterBar } from "./FilterBar";

const useUser = vi.hoisted(() => vi.fn());

vi.mock("~/features/auth/core/user", () => ({ useUser }));

beforeEach(() => {
	useUser.mockReturnValue({ id: 1 });
});

const MODES = ["SZ", "TC", "RM"];

function TestFilterBar(props: {
	initialMode?: string | null;
	initialWeapon?: string | null;
	initialRank?: string | null;
}) {
	const [mode, setMode] = useState<string | null>(props.initialMode ?? null);
	const [weapon, setWeapon] = useState<string | null>(
		props.initialWeapon ?? null,
	);
	// unlike the other pills this one seeds a value when added from the menu
	const [rank, setRank] = useState<string | null>(props.initialRank ?? null);

	return (
		<FilterBar
			pills={[
				{
					key: "mode",
					name: "Mode",
					formattedValue: mode,
					onRemove: () => setMode(null),
					popover: (
						<div>
							{MODES.map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setMode(value)}
								>
									Set {value}
								</button>
							))}
						</div>
					),
				},
				{
					key: "weapon",
					name: "Weapon",
					formattedValue: weapon,
					onRemove: () => setWeapon(null),
					popover: (
						<button type="button" onClick={() => setWeapon("Splattershot")}>
							Set Splattershot
						</button>
					),
				},
				{
					key: "rank",
					name: "Rank",
					formattedValue: rank,
					onAdd: () => setRank("S+"),
					onRemove: () => setRank(null),
					popover: (
						<button type="button" onClick={() => setRank("X")}>
							Set X
						</button>
					),
				},
			]}
			onReset={
				mode !== null || weapon !== null || rank !== null
					? () => {
							setMode(null);
							setWeapon(null);
							setRank(null);
						}
					: undefined
			}
			actions={<SendouButton>Save as default</SendouButton>}
		/>
	);
}

describe("FilterBar", () => {
	test("renders a set pill with its name and formatted value", async () => {
		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await expect
			.element(screen.getByRole("button", { name: /Mode.*SZ/ }))
			.toBeVisible();
	});

	test("updates the pill value instantly when changed in the popover", async () => {
		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await screen.getByRole("button", { name: "Mode SZ" }).click();
		await screen.getByRole("button", { name: "Set TC" }).click();

		await expect
			.element(screen.getByRole("button", { name: "Mode TC" }))
			.toBeVisible();
	});

	test("hides a pill at its default value behind the add filter menu", async () => {
		const screen = await render(<TestFilterBar />);

		await expect
			.element(screen.getByRole("button", { name: /Mode/ }))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: /Weapon/ }))
			.not.toBeInTheDocument();

		await screen.getByRole("button", { name: "Filter" }).click();

		await expect
			.element(screen.getByRole("menuitem", { name: "Weapon" }))
			.toBeVisible();
	});

	test("adding a pill opens its popover and keeps the pill visible while unset", async () => {
		const screen = await render(<TestFilterBar />);

		await screen.getByRole("button", { name: "Filter" }).click();
		await screen.getByRole("menuitem", { name: "Weapon" }).click();

		await expect
			.element(screen.getByRole("button", { name: "Set Splattershot" }))
			.toBeVisible();

		await screen.getByRole("button", { name: "Set Splattershot" }).click();

		await expect
			.element(screen.getByRole("button", { name: /Weapon.*Splattershot/ }))
			.toBeVisible();
	});

	test("removing a pill hides it again", async () => {
		const screen = await render(<TestFilterBar initialWeapon="Splattershot" />);

		await screen.getByRole("button", { name: "Remove Weapon filter" }).click();

		await expect
			.element(screen.getByRole("button", { name: /Weapon/ }))
			.not.toBeInTheDocument();
	});

	test("adding a pill seeds its starting value via onAdd", async () => {
		const screen = await render(<TestFilterBar />);

		await screen.getByRole("button", { name: "Filter" }).click();
		await screen.getByRole("menuitem", { name: "Rank" }).click();

		await expect
			.element(screen.getByRole("button", { name: /Rank.*S\+/ }))
			.toBeVisible();
	});

	test("renders the reset button and the actions slot", async () => {
		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await expect
			.element(screen.getByRole("button", { name: "Reset" }))
			.toBeVisible();
		await expect
			.element(screen.getByRole("button", { name: "Save as default" }))
			.toBeVisible();
	});

	test("resetting hides an added pill that was left unset", async () => {
		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await screen.getByRole("button", { name: "Filter", exact: true }).click();
		await screen.getByRole("menuitem", { name: "Weapon" }).click();

		// adding a pill opens its popover, which blocks the reset button beneath it
		await userEvent.keyboard("{Escape}");

		await screen.getByRole("button", { name: "Reset" }).click();

		await expect
			.element(screen.getByRole("button", { name: /Weapon/ }))
			.not.toBeInTheDocument();
	});

	test("renders nothing for a logged out user", async () => {
		useUser.mockReturnValue(null);

		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await expect
			.element(screen.getByRole("button", { name: /Mode/ }))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "Filter" }))
			.not.toBeInTheDocument();
	});

	test("hides the add filter menu when every pill is visible", async () => {
		const screen = await render(
			<TestFilterBar
				initialMode="SZ"
				initialWeapon="Splattershot"
				initialRank="X"
			/>,
		);

		await expect
			.element(screen.getByRole("button", { name: "Filter", exact: true }))
			.not.toBeInTheDocument();
	});
});
