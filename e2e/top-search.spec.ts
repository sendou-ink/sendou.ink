import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, test } from "./helpers/playwright";
import { TopSearchPage } from "./pages/top-search/top-search-page";
import { UserPage } from "./pages/user/user-page";

const MONTH_YEAR = { month: 3, year: 2023 };
const PLACED_PLAYER_NAME = "Brasario";
const RIVAL_NAME = "Twig?";

test.describe("Top search", () => {
	test("views different x rank placements", async ({ page, factories }) => {
		const player = await factories.UserFactory.create();
		await factories.XRankPlacementFactory.create({
			...MONTH_YEAR,
			playerUserId: player.id,
			name: PLACED_PLAYER_NAME,
			mode: "TC",
			region: "WEST",
		});

		const topSearch = new TopSearchPage(page);
		await topSearch.goto();

		await topSearch.selectLeaderboard({
			...MONTH_YEAR,
			mode: "TC",
			region: "WEST",
		});

		await expect(topSearch.placements.row(0)).toContainText(PLACED_PLAYER_NAME);
	});

	test("navigates from user page to x search player page to x search", async ({
		page,
		factories,
	}) => {
		const rival = await factories.UserFactory.create();
		// the admin places first, so their row is the one the leaderboard opens on
		await factories.XRankPlacementFactory.create({
			...MONTH_YEAR,
			playerUserId: ADMIN_ID,
			name: "Sendou",
			mode: "SZ",
			region: "WEST",
		});
		await factories.XRankPlacementFactory.create({
			...MONTH_YEAR,
			playerUserId: rival.id,
			name: RIVAL_NAME,
			mode: "SZ",
			region: "WEST",
		});

		const user = new UserPage(page);
		await user.goto(ADMIN_DISCORD_ID);

		const playerPlacements = await user.openPlacements();
		await expect(playerPlacements.locators.heading).toContainText("Sendou");

		const topSearch = await playerPlacements.openLeaderboard(0);
		await expect(topSearch.placements.row(1)).toContainText(RIVAL_NAME);
	});
});
