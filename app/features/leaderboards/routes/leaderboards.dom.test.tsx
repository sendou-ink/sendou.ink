import { afterEach, describe, expect, test, vi } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createBrowserRouter, RouterProvider } from "react-router";
import { leaderboardsSearchParams } from "../leaderboards-search-params";
import LeaderboardsPage from "./leaderboards";

vi.mock("../loaders/leaderboards.server", () => ({ loader: vi.fn() }));
vi.mock("../actions/leaderboards.server", () => ({ action: vi.fn() }));
const mocks = {
	user: null as { id: number; roles: Array<string> } | null,
};
vi.mock("~/features/auth/core/user", () => ({ useUser: () => mocks.user }));

const userLeaderboardData = {
	userLeaderboard: [],
	ownEntryPeek: null,
	teamLeaderboard: null,
	xpLeaderboard: null,
	season: 9,
};

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
	members: [{ id: entryId, username, customUrl: null }],
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

const showLeaderboard = (
	params: Parameters<typeof leaderboardsSearchParams.href>[1],
) =>
	window.history.replaceState(
		null,
		"",
		leaderboardsSearchParams.href(window.location.pathname, params),
	);

const showTeamLeaderboard = () => showLeaderboard({ type: "TEAM", season: 9 });

const currentSearchParams = () => new URLSearchParams(window.location.search);

describe("LeaderboardsPage", () => {
	test("tab navigation shows the selected XP leaderboard instead of the default SP leaderboard", async () => {
		showLeaderboard({ type: "XP-ALL", season: null });

		renderPage(xpLeaderboardData);

		const xpTab = await screen.findByRole("tab", { name: "X Battle" });
		expect(xpTab).toHaveAttribute("aria-selected", "true");
	});

	test("clears the season when moving to the X Battle tab", async () => {
		showLeaderboard({ type: "USER", season: 9 });

		renderPage(userLeaderboardData);
		await userEvent.click(await screen.findByRole("tab", { name: "X Battle" }));

		await waitFor(() =>
			expect(currentSearchParams().get("type")).toBe("XP-ALL"),
		);
		expect(currentSearchParams().get("season")).toBeNull();
	});

	test("keeps the season when moving to the teams tab", async () => {
		showLeaderboard({ type: "USER", season: 9 });

		renderPage(userLeaderboardData);
		await userEvent.click(await screen.findByRole("tab", { name: "Teams" }));

		await waitFor(() => expect(currentSearchParams().get("type")).toBe("TEAM"));
		expect(currentSearchParams().get("season")).toBe("9");
	});

	test("switches the team leaderboard to all rosters from the scope chips", async () => {
		showTeamLeaderboard();

		renderPage(teamLeaderboardData);
		await userEvent.click(await screen.findByText("All rosters"));

		await waitFor(() =>
			expect(currentSearchParams().get("type")).toBe("TEAM-ALL"),
		);
		expect(currentSearchParams().get("season")).toBe("9");
	});

	test("preselects the weapon of a weapon XP leaderboard", async () => {
		showLeaderboard({ type: "XP-WEAPON-40", season: null });

		renderPage(xpLeaderboardData);

		expect(await screen.findByTestId("weapon-select")).toHaveTextContent(
			"Splattershot",
		);
	});

	test("hides the skip menu from a user without a staff role", async () => {
		showTeamLeaderboard();

		renderPage(teamLeaderboardData);
		expect(
			await screen.findByRole("link", { name: "placing_team_player" }),
		).toBeVisible();

		expect(screen.queryAllByRole("button", { name: "Actions" })).toHaveLength(
			0,
		);
	});

	test("hides the skip menu from staff on the all rosters leaderboard", async () => {
		showLeaderboard({ type: "TEAM-ALL", season: 9 });
		mocks.user = { id: 1, roles: ["STAFF"] };

		renderPage(teamLeaderboardData);
		expect(
			await screen.findByRole("link", { name: "placing_team_player" }),
		).toBeVisible();

		expect(screen.queryAllByRole("button", { name: "Actions" })).toHaveLength(
			0,
		);
	});

	test("offers staff the actions of every team", async () => {
		showTeamLeaderboard();
		mocks.user = { id: 1, roles: ["STAFF"] };

		renderPage(teamLeaderboardData);
		expect(
			await screen.findByRole("link", { name: "placing_team_player" }),
		).toBeVisible();

		expect(screen.queryAllByRole("button", { name: "Actions" })).toHaveLength(
			2,
		);
	});
});
