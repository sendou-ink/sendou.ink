import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SendouButton } from "../elements/Button";
import { FilterBar } from "./FilterBar";

const MODES = ["SZ", "TC", "RM"];

function TestFilterBar(props: {
	initialMode?: string | null;
	initialWeapon?: string | null;
}) {
	const [mode, setMode] = useState<string | null>(props.initialMode ?? null);
	const [weapon, setWeapon] = useState<string | null>(
		props.initialWeapon ?? null,
	);

	return (
		<FilterBar
			pills={[
				{
					key: "mode",
					name: "Mode",
					pinned: true,
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
			]}
			actions={
				mode !== null || weapon !== null ? (
					<SendouButton size="small" variant="minimal">
						Reset
					</SendouButton>
				) : null
			}
		/>
	);
}

describe("FilterBar", () => {
	test("renders a pinned pill with its name and formatted value", async () => {
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

	test("hides an unset optional pill behind the add filter menu", async () => {
		const screen = await render(<TestFilterBar />);

		await expect
			.element(screen.getByRole("button", { name: /Weapon/ }))
			.not.toBeInTheDocument();

		await screen.getByRole("button", { name: "Filter" }).click();

		await expect
			.element(screen.getByRole("menuitem", { name: "Weapon" }))
			.toBeVisible();
	});

	test("adding an optional pill opens its popover and keeps the pill visible while unset", async () => {
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

	test("removing an optional pill hides it again", async () => {
		const screen = await render(<TestFilterBar initialWeapon="Splattershot" />);

		await screen.getByRole("button", { name: "Remove Weapon filter" }).click();

		await expect
			.element(screen.getByRole("button", { name: /Weapon/ }))
			.not.toBeInTheDocument();
	});

	test("renders the actions slot", async () => {
		const screen = await render(<TestFilterBar initialMode="SZ" />);

		await expect
			.element(screen.getByRole("button", { name: "Reset" }))
			.toBeVisible();
	});

	test("hides the add filter menu when every pill is visible", async () => {
		const screen = await render(<TestFilterBar initialWeapon="Splattershot" />);

		await expect
			.element(screen.getByRole("button", { name: "Filter", exact: true }))
			.not.toBeInTheDocument();
	});
});
