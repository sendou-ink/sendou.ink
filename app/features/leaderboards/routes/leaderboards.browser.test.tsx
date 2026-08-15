import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { leaderboardsSearchParams } from "../leaderboards-search-params";
import LeaderboardsPage from "./leaderboards";

vi.mock("../loaders/leaderboards.server", () => ({ loader: vi.fn() }));
vi.mock("../actions/leaderboards.server", () => ({ action: vi.fn() }));
const mocks = vi.hoisted(() => ({
	user: null as { id: number; roles: Array<string> } | null,
}));
vi.mock("~/features/auth/core/user", () => ({ useUser: () => mocks.user }));

const xpLeaderboardData = {
	userLeaderboard: undefined,
	ownEntryPeek: null,
	teamLeaderboard: null,
	xpLeaderboard: [],
	season: 9,
};

const teamEntry = ({
	entryId,
	username,
	isSkipped,
	placementRank,
}: {
	entryId: number;
	username: string;
	isSkipped: boolean;
	placementRank: number | null;
}) => ({
	entryId,
	identifier: `${entryId}-2-3-4`,
	ordinal: 25,
	power: 1500,
	isSkipped,
	placementRank,
	members: [
		{ id: entryId, username, discordId: `${entryId}`, customUrl: null },
	],
	team: undefined,
});

const teamLeaderboardData = {
	userLeaderboard: undefined,
	ownEntryPeek: null,
	teamLeaderboard: [
		teamEntry({
			entryId: 1,
			username: "skipped_team_player",
			isSkipped: true,
			placementRank: null,
		}),
		teamEntry({
			entryId: 2,
			username: "placing_team_player",
			isSkipped: false,
			placementRank: 1,
		}),
	],
	xpLeaderboard: null,
	season: 9,
};

function renderPage(loaderData: unknown) {
	const router = createBrowserRouter([
		{
			path: "*",
			element: <LeaderboardsPage />,
			loader: () => loaderData,
		},
	]);

	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
	mocks.user = null;
});

const showTeamLeaderboard = () =>
	window.history.replaceState(
		null,
		"",
		leaderboardsSearchParams.href(window.location.pathname, {
			type: "TEAM",
			season: 9,
		}),
	);

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

		const screen = await renderPage(xpLeaderboardData);

		const select = screen.getByRole("combobox");
		await expect.element(select).toBeVisible();

		expect((select.element() as HTMLSelectElement).value).toBe("XP-ALL");
	});

	test("crosses out the players of a skipped team", async () => {
		showTeamLeaderboard();

		const screen = await renderPage(teamLeaderboardData);

		const skipped = screen.getByRole("link", { name: "skipped_team_player" });
		await expect.element(skipped).toBeVisible();
		const placing = screen.getByRole("link", { name: "placing_team_player" });

		expect(textDecorationLineOfRow(skipped.element())).toBe("line-through");
		expect(textDecorationLineOfRow(placing.element())).toBe("none");
	});

	test("hides the skip menu from a user without a staff role", async () => {
		showTeamLeaderboard();

		const screen = await renderPage(teamLeaderboardData);
		await expect
			.element(screen.getByRole("link", { name: "placing_team_player" }))
			.toBeVisible();

		expect(screen.getByRole("button", { name: "Actions" }).all()).toHaveLength(
			0,
		);
	});

	test("offers staff the actions of every team", async () => {
		showTeamLeaderboard();
		mocks.user = { id: 1, roles: ["STAFF"] };

		const screen = await renderPage(teamLeaderboardData);
		await expect
			.element(screen.getByRole("link", { name: "placing_team_player" }))
			.toBeVisible();

		expect(screen.getByRole("button", { name: "Actions" }).all()).toHaveLength(
			2,
		);
	});
});

function textDecorationLineOfRow(memberLink: Element) {
	return getComputedStyle(memberLink.parentElement!).textDecorationLine;
}
