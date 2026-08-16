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
	// the app's flex body would otherwise size the render container to its
	// content, laying the page out too narrow for its elements to be clickable
	const container = document.body.appendChild(document.createElement("div"));
	container.style.width = "100%";

	const router = createBrowserRouter([
		{
			path: "*",
			element: <LeaderboardsPage />,
			loader: () => loaderData,
		},
	]);

	return render(<RouterProvider router={router} />, { container });
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

		const screen = await renderPage(xpLeaderboardData);

		const xpTab = screen.getByRole("tab", { name: "X Battle" });
		await expect.element(xpTab).toHaveAttribute("aria-selected", "true");
	});

	test("clears the season when moving to the X Battle tab", async () => {
		showLeaderboard({ type: "USER", season: 9 });

		const screen = await renderPage(userLeaderboardData);
		await screen.getByRole("tab", { name: "X Battle" }).click();

		await expect.poll(() => currentSearchParams().get("type")).toBe("XP-ALL");
		expect(currentSearchParams().get("season")).toBeNull();
	});

	test("keeps the season when moving to the teams tab", async () => {
		showLeaderboard({ type: "USER", season: 9 });

		const screen = await renderPage(userLeaderboardData);
		await screen.getByRole("tab", { name: "Teams" }).click();

		await expect.poll(() => currentSearchParams().get("type")).toBe("TEAM");
		expect(currentSearchParams().get("season")).toBe("9");
	});

	test("switches the team leaderboard to all rosters from the scope chips", async () => {
		showTeamLeaderboard();

		const screen = await renderPage(teamLeaderboardData);
		await screen.getByText("All rosters").click();

		await expect.poll(() => currentSearchParams().get("type")).toBe("TEAM-ALL");
		expect(currentSearchParams().get("season")).toBe("9");
	});

	test("preselects the weapon of a weapon XP leaderboard", async () => {
		showLeaderboard({ type: "XP-WEAPON-40", season: null });

		const screen = await renderPage(xpLeaderboardData);

		await expect
			.element(screen.getByTestId("weapon-select"))
			.toHaveTextContent("Splattershot");
	});

	test("falls back to all X Battle when the weapon is cleared", async () => {
		showLeaderboard({ type: "XP-WEAPON-40", season: null });

		const screen = await renderPage(xpLeaderboardData);
		await screen.getByRole("button", { name: "Clear" }).click();

		await expect.poll(() => currentSearchParams().get("type")).toBe("XP-ALL");
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

	test("hides the skip menu from staff on the all rosters leaderboard", async () => {
		showLeaderboard({ type: "TEAM-ALL", season: 9 });
		mocks.user = { id: 1, roles: ["STAFF"] };

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
