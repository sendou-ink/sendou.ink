import { expect, test } from "./helpers/playwright";
import { LeaderboardsPage } from "./pages/leaderboards/leaderboards-page";

const HIGH_POWER_NAME = "TopPlayer";
const LOW_POWER_NAME = "RunnerUp";
const RM_ONLY_NAME = "RainmakerMain";

test.describe("Leaderboards", () => {
	test("shows the season player leaderboard ordered by SP", async ({
		page,
		factories,
	}) => {
		// season 1 renders its first ten entries through the static top-ten
		// showcase (names come from top-ten.json, not the database), so the
		// asserted users must rank below ten fillers to appear as normal rows
		for (let i = 0; i < 10; i++) {
			const filler = await factories.UserFactory.create();
			await factories.SkillFactory.create(
				{ userId: filler.id, mu: 40 - i },
				{ matchesCount: 10 },
			);
		}
		const better = await factories.UserFactory.create({
			discordName: "BetterPlayer",
		});
		const worse = await factories.UserFactory.create({
			discordName: "WorsePlayer",
		});
		await factories.SkillFactory.create(
			{ userId: better.id, mu: 25 },
			{ matchesCount: 10 },
		);
		await factories.SkillFactory.create(
			{ userId: worse.id, mu: 20 },
			{ matchesCount: 10 },
		);

		const leaderboards = new LeaderboardsPage(page);
		await leaderboards.goto();

		const betterRow = page.getByRole("link", { name: /BetterPlayer/ });
		const worseRow = page.getByRole("link", { name: /WorsePlayer/ });
		await expect(betterRow).toBeVisible();
		await expect(worseRow).toBeVisible();

		const betterBox = await betterRow.boundingBox();
		const worseBox = await worseRow.boundingBox();
		expect(betterBox!.y).toBeLessThan(worseBox!.y);
	});

	test("filters the X Battle leaderboard by mode", async ({
		page,
		factories,
	}) => {
		const zonesPlayer = await factories.UserFactory.create();
		const rainmakerPlayer = await factories.UserFactory.create();
		await factories.XRankPlacementFactory.create({
			playerUserId: zonesPlayer.id,
			name: HIGH_POWER_NAME,
			mode: "SZ",
			power: 3200,
			weaponSplId: 40,
		});
		await factories.XRankPlacementFactory.create({
			name: LOW_POWER_NAME,
			playerSplId: `runner-up-${zonesPlayer.id}`,
			mode: "SZ",
			power: 3000,
			weaponSplId: 1000,
		});
		await factories.XRankPlacementFactory.create({
			playerUserId: rainmakerPlayer.id,
			name: RM_ONLY_NAME,
			mode: "RM",
			power: 2900,
			weaponSplId: 2000,
		});

		const leaderboards = new LeaderboardsPage(page);
		await leaderboards.goto("?type=XP-ALL");

		await expect(page.getByText(HIGH_POWER_NAME)).toBeVisible();
		await expect(page.getByText(RM_ONLY_NAME)).toBeVisible();

		await leaderboards.selectModeChip("Rainmaker");
		await expect(page.getByText(RM_ONLY_NAME)).toBeVisible();
		await expect(page.getByText(HIGH_POWER_NAME)).not.toBeVisible();
		expect(page.url()).toContain("type=XP-MODE-RM");
	});

	test("switching to the X Battle tab clears the season param", async ({
		page,
	}) => {
		const leaderboards = new LeaderboardsPage(page);
		await leaderboards.goto("?season=1");

		await leaderboards.selectTab("xpTab");

		expect(page.url()).toContain("type=XP-ALL");
		expect(page.url()).not.toContain("season=");
	});
});
