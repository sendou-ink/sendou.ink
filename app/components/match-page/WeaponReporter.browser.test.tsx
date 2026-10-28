import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
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

	return { onSubmit, rendered: render(<RouterProvider router={router} />) };
}

const poolWeaponButton = (name: string) =>
	page.getByRole("button", { name, exact: true });

const weaponPoolBanner = () => page.getByRole("img", { name: "Your weapons" });

const submitButton = () => page.getByRole("button", { name: "Submit" });

describe("WeaponReporter", () => {
	test("picking a weapon from the pool selects it for submitting", async () => {
		const { onSubmit, rendered } = renderReporter({
			weaponPoolIds: [SPLATTERSHOT, SPLAT_ROLLER],
		});
		await rendered;

		await expect.element(weaponPoolBanner()).toBeInTheDocument();
		await expect.element(submitButton()).toBeDisabled();

		await poolWeaponButton("Splat Roller").click();
		await submitButton().click();

		expect(onSubmit).toHaveBeenCalledWith(SPLAT_ROLLER);
	});

	test("clears the pool pick once the next map's input shows", async () => {
		const { rendered } = renderReporter({ weaponPoolIds: [SPLATTERSHOT] });
		await rendered;

		await poolWeaponButton("Splattershot").click();
		await submitButton().click();

		await expect
			.element(page.getByRole("button", { name: /Your weapon #2/ }))
			.toBeInTheDocument();
		await expect.element(submitButton()).toBeDisabled();
	});

	test("shows no pool picks without a weapon pool", async () => {
		const { rendered } = renderReporter({ weaponPoolIds: [] });
		await rendered;

		await expect.element(submitButton()).toBeInTheDocument();
		await expect.element(weaponPoolBanner()).not.toBeInTheDocument();
	});
});
