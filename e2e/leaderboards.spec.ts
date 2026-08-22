import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import type { Factories } from "./helpers/factories";
import {
	endSeason,
	expect,
	expectNoErrorPage,
	isNotVisible,
	test,
} from "./helpers/playwright";
import { LeaderboardsPage } from "./pages/leaderboards/leaderboards-page";

const CURRENT_SEASON = 1;

/** Splattershot, making the admin count for the Shooters category leaderboard. */
const ADMIN_WEAPON_SPL_ID = 40;

/** Name the season's top ten showcase renders for the first placement, from top-ten.json. */
const TOP_TEN_FIRST_PLACE_NAME = "Jared";

test.describe("Leaderboards", () => {
	test("shows qualified players, teams and X Battle placements across the leaderboard views and the season boundary", async ({
		page,
		factories,
	}) => {
		await seedLeaderboards(factories);

		const leaderboards = new LeaderboardsPage(page);
		await leaderboards.goto();
		await expectNoErrorPage(page);

		// top ten renders in the showcase format, the 11th entry as a normal row
		await expect(
			leaderboards.entryName(TOP_TEN_FIRST_PLACE_NAME),
		).toBeVisible();
		await expect(leaderboards.entryName("Tail Ender 3")).toBeVisible();
		await expect(leaderboards.locators.updateInfoText).toBeVisible();

		// N-ZAP has the highest rating of the pool but one match too few to qualify
		await isNotVisible(leaderboards.entryName("N-ZAP"));

		// weapon category leaderboard only has the player with enough reported weapons
		await leaderboards.filterChip("Shooters").click();
		await expect(leaderboards.entryName("Sendou")).toBeVisible();
		await isNotVisible(leaderboards.entryName("Alpha Mate 1"));

		await leaderboards.tab("Teams").click();
		await expectNoErrorPage(page);
		await expect(leaderboards.entryName("Alpha Mate 1")).toBeVisible();
		await expect(leaderboards.entryName("Bravo Foe 4")).toBeVisible();

		await leaderboards.filterChip("All rosters").click();
		await expect(leaderboards.filterChipRadio("All rosters")).toBeChecked();
		await expect(leaderboards.entryName("Alpha Mate 1")).toBeVisible();
		await expect(leaderboards.entryName("Bravo Foe 4")).toBeVisible();

		await leaderboards.tab("X Battle").click();
		await expectNoErrorPage(page);
		await expect(leaderboards.entryName("XP Zones Ace")).toBeVisible();
		await expect(leaderboards.entryName("XP Tower Ace")).toBeVisible();

		await leaderboards.filterChip("Tower Control").click();
		await isNotVisible(leaderboards.entryName("XP Zones Ace"));
		await expect(leaderboards.entryName("XP Tower Ace")).toBeVisible();

		await leaderboards.selectXPWeapon("Splattershot");
		await isNotVisible(leaderboards.entryName("XP Tower Ace"));
		await expect(leaderboards.entryName("XP Zones Ace")).toBeVisible();

		// once the season ends the page defaults to the previous, empty season
		await endSeason(page);
		await leaderboards.goto();
		await expectNoErrorPage(page);
		await expect(leaderboards.locators.noPlayersText).toBeVisible();

		// the ended season stays browsable via the season select, now finalized
		await leaderboards.selectSeason(CURRENT_SEASON);
		await expect(
			leaderboards.entryName(TOP_TEN_FIRST_PLACE_NAME),
		).toBeVisible();
		await expect(leaderboards.entryName("Tail Ender 3")).toBeVisible();
	});
});

/**
 * Fills the current season's leaderboards: two full rosters playing each other for
 * exactly the qualifying match count (admin's alpha roster winning every set), three
 * low-rated players qualifying via their skill rows so the board reaches past the top
 * ten showcase, N-ZAP left one match short of qualifying despite the highest rating,
 * enough reported weapons to give the admin a Shooters entry, and two X Battle
 * placements in different modes and weapons.
 */
async function seedLeaderboards(factories: Factories) {
	const mates = await factories.UserFactory.createMany(3, (i) => ({
		discordName: `Alpha Mate ${i + 1}`,
	}));
	const enemies = await factories.UserFactory.createMany(4, (i) => ({
		discordName: `Bravo Foe ${i + 1}`,
	}));

	const alphaUserIds = [ADMIN_ID, ...mates.map((mate) => mate.id)];
	const bravoUserIds = enemies.map((enemy) => enemy.id);

	const matches = [];
	for (let i = 0; i < MATCHES_COUNT_NEEDED_FOR_LEADERBOARD; i++) {
		matches.push(
			await factories.SQMatchFactory.create(
				{ alphaUserIds, bravoUserIds },
				{ isConcluded: true },
			),
		);
	}

	// one more weapon report than the qualifying match count, as the category needs
	for (const match of matches.slice(0, 2)) {
		await factories.SQReportedWeaponFactory.createMany(4, (mapIndex) => ({
			groupMatchId: match.id,
			mapIndex,
			userId: ADMIN_ID,
			weaponSplId: ADMIN_WEAPON_SPL_ID,
		}));
	}

	const tailEnders = await factories.UserFactory.createMany(3, (i) => ({
		discordName: `Tail Ender ${i + 1}`,
	}));
	for (const [i, tailEnder] of tailEnders.entries()) {
		await factories.SkillFactory.create(
			{ userId: tailEnder.id, mu: 3 - i, sigma: 10 },
			{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD },
		);
	}

	// guaranteed last were it wrongly included, so its username would show as a row
	await factories.SkillFactory.create(
		{ userId: NZAP_TEST_ID, mu: 1, sigma: 12 },
		{ matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - 1 },
	);

	await factories.XRankPlacementFactory.create({
		playerUserId: ADMIN_ID,
		mode: "SZ",
		weaponSplId: ADMIN_WEAPON_SPL_ID,
		power: 3000,
		name: "XP Zones Ace",
	});
	await factories.XRankPlacementFactory.create({
		playerSplId: "xp-tower-ace",
		mode: "TC",
		weaponSplId: 2010,
		power: 2800,
		name: "XP Tower Ace",
	});
}
