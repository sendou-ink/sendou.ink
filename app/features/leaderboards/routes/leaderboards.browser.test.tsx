import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { leaderboardsSearchParams } from "../leaderboards-search-params";
import LeaderboardsPage from "./leaderboards";

vi.mock("../loaders/leaderboards.server", () => ({ loader: vi.fn() }));

const xpLeaderboardData = {
	userLeaderboard: undefined,
	ownEntryPeek: null,
	teamLeaderboard: null,
	xpLeaderboard: [],
	season: 9,
};

function renderPage() {
	const router = createBrowserRouter([
		{
			path: "*",
			element: <LeaderboardsPage />,
			loader: () => xpLeaderboardData,
		},
	]);

	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
});

describe("LeaderboardsPage", () => {
	test("type select shows the selected XP leaderboard instead of the default SP leaderboard", async () => {
		window.history.replaceState(
			null,
			"",
			leaderboardsSearchParams.href(window.location.pathname, {
				type: "XP-ALL",
				season: null,
			}),
		);

		const screen = await renderPage();

		const select = screen.getByRole("combobox");
		await expect.element(select).toBeVisible();

		expect((select.element() as HTMLSelectElement).value).toBe("XP-ALL");
	});
});
