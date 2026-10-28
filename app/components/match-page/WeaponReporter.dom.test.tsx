import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { WeaponReporter, type WeaponReporterMap } from "./WeaponReporter";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

const SPLATTERSHOT = 40 as MainWeaponId;
const SPLAT_ROLLER = 1010 as MainWeaponId;

const MAPS: WeaponReporterMap[] = [
	{ mapIndex: 0, stageId: stagesObj.HAGGLEFISH_MARKET, mode: "SZ" },
	{ mapIndex: 1, stageId: stagesObj.WAHOO_WORLD, mode: "TC" },
];

function renderReporter({ weaponPoolIds }: { weaponPoolIds?: MainWeaponId[] }) {
	const onSubmit = vi.fn<(weaponSplId: MainWeaponId) => void>();

	function Harness() {
		const [pastReported, setPastReported] = React.useState<MainWeaponId[]>([]);

		return (
			<div style={{ width: 600 }}>
				<WeaponReporter
					maps={MAPS}
					pastReported={pastReported}
					nextMapIndex={pastReported.length}
					weaponPoolIds={weaponPoolIds}
					onSubmit={(weaponSplId) => {
						onSubmit(weaponSplId);
						setPastReported((prev) => [...prev, weaponSplId]);
					}}
					onUndo={() => {}}
					standalone
				/>
			</div>
		);
	}

	const router = createMemoryRouter([{ path: "*", element: <Harness /> }], {
		initialEntries: ["/"],
	});

	render(<RouterProvider router={router} />);

	return { onSubmit };
}

const poolWeaponButton = (name: string) =>
	screen.findByRole("button", { name });

const weaponPoolBanner = () =>
	screen.queryByRole("img", { name: "Your weapons" });

const submitButton = () => screen.findByRole("button", { name: "Submit" });

describe("WeaponReporter", () => {
	test("picking a weapon from the pool selects it for submitting", async () => {
		const { onSubmit } = renderReporter({
			weaponPoolIds: [SPLATTERSHOT, SPLAT_ROLLER],
		});

		expect(await submitButton()).toBeDisabled();
		expect(weaponPoolBanner()).toBeInTheDocument();

		await userEvent.click(await poolWeaponButton("Splat Roller"));
		await userEvent.click(await submitButton());

		expect(onSubmit).toHaveBeenCalledWith(SPLAT_ROLLER);
	});

	test("clears the pool pick once the next map's input shows", async () => {
		renderReporter({ weaponPoolIds: [SPLATTERSHOT] });

		await userEvent.click(await poolWeaponButton("Splattershot"));
		await userEvent.click(await submitButton());

		expect(
			await screen.findByRole("button", { name: /Your weapon #2/ }),
		).toBeInTheDocument();
		expect(await submitButton()).toBeDisabled();
	});

	test("shows no pool picks without a weapon pool", async () => {
		renderReporter({ weaponPoolIds: [] });

		expect(await submitButton()).toBeInTheDocument();
		expect(weaponPoolBanner()).not.toBeInTheDocument();
	});
});
