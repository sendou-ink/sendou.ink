import { beforeEach, describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { SendouButton } from "../elements/Button";
import { FilterBar } from "./FilterBar";

const useUser = vi.fn();

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
	test("renders a set pill with its name and formatted value", () => {
		render(<TestFilterBar initialMode="SZ" />);

		expect(screen.getByRole("button", { name: /Mode.*SZ/ })).toBeVisible();
	});

	test("removing a pill hides it again", async () => {
		render(<TestFilterBar initialWeapon="Splattershot" />);

		await userEvent.click(
			screen.getByRole("button", { name: "Remove Weapon filter" }),
		);

		expect(
			screen.queryByRole("button", { name: /Weapon/ }),
		).not.toBeInTheDocument();
	});

	test("renders the reset button and the actions slot", () => {
		render(<TestFilterBar initialMode="SZ" />);

		expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Save as default" }),
		).toBeVisible();
	});

	test("hides the add filter menu when every pill is visible", () => {
		render(
			<TestFilterBar
				initialMode="SZ"
				initialWeapon="Splattershot"
				initialRank="X"
			/>,
		);

		expect(
			screen.queryByRole("button", { name: "Filter" }),
		).not.toBeInTheDocument();
	});
});
