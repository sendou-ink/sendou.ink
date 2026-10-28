import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { analyzerSearchParams } from "../analyzer-search-params";
import BuildAnalyzerShell from "./analyzer";

vi.mock("../loaders/analyzer.server", () => ({ loader: vi.fn() }));
vi.mock("~/features/auth/core/user", () => ({ useUser: () => null }));

const SQUEEZER_ID: MainWeaponId = 400;
const BALLPOINT_SPLATLING_ID: MainWeaponId = 4030;

function renderAnalyzer(weapon: MainWeaponId) {
	window.history.replaceState(
		null,
		"",
		analyzerSearchParams.href(window.location.pathname, { weapon }),
	);

	const router = createBrowserRouter([
		{ path: "*", element: <BuildAnalyzerShell />, loader: () => ({}) },
	]);

	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
});

describe("BuildAnalyzerShell", () => {
	test.each([
		["Squeezer", SQUEEZER_ID],
		["Ballpoint Splatling", BALLPOINT_SPLATLING_ID],
	])("shows the secondary mode damage of %s", async (_, weapon) => {
		const screen = await renderAnalyzer(weapon);
		await screen.getByText("Main weapon damage").click();

		await expect
			.element(screen.getByRole("cell", { name: "Maximum", exact: true }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole("cell", { name: "Secondary mode (Maximum)" }))
			.toBeInTheDocument();
	});
});
