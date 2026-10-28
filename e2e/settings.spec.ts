import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { WeaponBuildsPage } from "./pages/builds/weapon-builds-page";
import { CalendarPage } from "./pages/calendar/calendar-page";
import { FaqPage } from "./pages/info/faq-page";
import { MatchProfilePage } from "./pages/settings/match-profile-page";
import { SettingsPage } from "./pages/settings/settings-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentResultsPage } from "./pages/tournament/tournament-results-page";

const LUNA_BLASTER_ID = 200;

// deliberately scrambled so the sorted and unsorted renders differ
const UNSORTED_ABILITIES: BuildAbilitiesTuple = [
	["ISM", "SSU", "ISM", "SSU"],
	["SSU", "ISM", "SSU", "ISM"],
	["RSU", "QR", "QR", "QR"],
];

test.describe("Settings", () => {
	test("updates 'disableBuildAbilitySorting'", async ({ page, factories }) => {
		await factories.BuildFactory.create({
			ownerId: ADMIN_ID,
			weaponSplIds: [LUNA_BLASTER_ID],
			abilities: UNSORTED_ABILITIES,
		});

		await impersonate(page);

		const weaponBuilds = new WeaponBuildsPage(page);
		await weaponBuilds.goto("luna-blaster");

		const oldContents = await weaponBuilds.buildCard(0).root.innerHTML();

		const settings = new SettingsPage(page);
		await settings.disableBuildAbilitySorting();

		await weaponBuilds.goto("luna-blaster");

		const newContents = await weaponBuilds.buildCard(0).root.innerHTML();

		expect(newContents).not.toBe(oldContents);
	});

	test("updates clock format preference", async ({ page, factories }) => {
		// the clock header only renders above a day's events
		await factories.CalendarEventFactory.create({ authorId: ADMIN_ID });

		await impersonate(page);

		const calendar = new CalendarPage(page);
		await calendar.goto();

		const clockTime = calendar.locators.clockHeaderTimes.first();
		const initialTime = await clockTime.textContent();

		expect(initialTime).toMatch(/AM|PM/);

		const settings = new SettingsPage(page);
		await settings.setClockFormat("24h");

		await calendar.goto();

		const newTime = await clockTime.textContent();

		expect(newTime).not.toMatch(/AM|PM/);
		expect(newTime).not.toBe(initialTime);
		expect(newTime).toContain(":");
	});

	test("switches language to Japanese, persists it across pages and restores English", async ({
		page,
	}) => {
		const settings = new SettingsPage(page);
		const faq = new FaqPage(page);

		await settings.goto("locale");
		await expect(settings.locators.pageHeading).toHaveText("Settings");

		await settings.selectLanguage("日本語");
		await expect(settings.locators.pageHeading).toHaveText("設定");

		// full page load without the lng param -> the language comes from the cookie;
		// the faq namespace is registered via the route handle
		await faq.goto();
		await expect(faq.question("プラスサーバーとはなんですか?")).toBeVisible();

		await settings.goto("locale");
		await expect(settings.locators.pageHeading).toHaveText("設定");

		await settings.selectLanguage("English");
		await expect(settings.locators.pageHeading).toHaveText("Settings");

		await faq.goto();
		await expect(faq.question("What is the Plus Server?")).toBeVisible();
	});

	test("shows in-game names in the picked game language and the rest in the site's language", async ({
		page,
		factories,
	}) => {
		await factories.BuildFactory.create({
			ownerId: ADMIN_ID,
			weaponSplIds: [LUNA_BLASTER_ID],
		});

		const settings = new SettingsPage(page);
		const weaponBuilds = new WeaponBuildsPage(page);

		await settings.goto("locale");
		await settings.selectGameLanguage("日本語");

		await weaponBuilds.goto("luna-blaster");
		await expect(
			weaponBuilds.buildCard(0).weaponImage("ノヴァブラスター"),
		).toBeVisible();
		await expect(weaponBuilds.locators.abilityStatsTab).toBeVisible();
	});

	test("persists sound settings and dark/light theme across reload", async ({
		page,
	}) => {
		await impersonate(page);

		const settings = new SettingsPage(page);
		await settings.goto("sounds");

		const likeSound = settings.soundCheckbox("Group invitation received");
		await expect(likeSound).toBeChecked();
		await likeSound.click();
		await expect(likeSound).not.toBeChecked();
		await settings.setSoundVolume("37");

		// default resolves to light (auto + light color scheme) so dark is a real change
		await settings.goto("theme");
		await settings.setTheme("Dark");
		await expect(settings.locators.htmlRoot).toHaveClass(/dark/);

		await settings.reload();
		await expect(settings.locators.htmlRoot).toHaveClass(/dark/);

		await settings.goto("sounds");
		await expect(likeSound).not.toBeChecked();
		await expect(settings.locators.volumeSlider).toHaveValue("37");

		await settings.goto("theme");
		await settings.setTheme("Light");
		await expect(settings.locators.htmlRoot).toHaveClass(/light/);
		await expect(settings.locators.htmlRoot).not.toHaveClass(/dark/);
	});
});

test.describe("Match profile map preferences", () => {
	test("shows win rates, sorts maps by them and edits the pool from the slots", async ({
		page,
		factories,
	}) => {
		const season = Seasons.allStarted()[0];
		await factories.MapResultFactory.create({
			userId: ADMIN_ID,
			season,
			mode: "TC",
			stageId: 1,
			wins: 1,
			losses: 4,
		});
		await factories.MapResultFactory.create({
			userId: ADMIN_ID,
			season,
			mode: "TC",
			stageId: 2,
			wins: 8,
			losses: 2,
		});

		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();

		await expect(matchProfile.maps.modeRow("TC")).toContainText("60%");

		await matchProfile.maps.selectModeTab("TC");
		await expect(matchProfile.maps.mapCards("TC").first()).toHaveAttribute(
			"data-testid",
			"map-pool-TC-1",
		);
		await matchProfile.maps.sortMaps("BEST");
		await expect(matchProfile.maps.mapCards("TC").first()).toHaveAttribute(
			"data-testid",
			"map-pool-TC-2",
		);
		await expect(matchProfile.maps.mapCards("TC").first()).toContainText("#1");

		await matchProfile.maps.mapButton("TC", 2).click();
		await matchProfile.maps.poolSlot("Hagglefish Market").click();
		await expect(matchProfile.maps.mapButton("TC", 2)).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		await expect(matchProfile.maps.bannedMap("Wahoo World")).not.toBeVisible();
		await matchProfile.maps.bannedMapsToggle().click();
		await expect(matchProfile.maps.bannedMap("Wahoo World")).toBeVisible();
	});

	test("retains map selection when toggling a mode prefer -> avoid -> prefer", async ({
		page,
	}) => {
		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();

		await matchProfile.maps.setModePreference("SZ", "Prefer");
		await matchProfile.maps.selectModeTab("SZ");
		await matchProfile.maps.mapButton("SZ", 1).click();
		await expect(matchProfile.maps.mapButton("SZ", 1)).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		// avoiding hides the picker, but the selection should be remembered
		await matchProfile.maps.setModePreference("SZ", "Avoid");
		await isNotVisible(matchProfile.maps.mapButton("SZ", 1));

		await matchProfile.maps.setModePreference("SZ", "Prefer");
		await matchProfile.maps.selectModeTab("SZ");
		await expect(matchProfile.maps.mapButton("SZ", 1)).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	test("can save 'zones only' after a now-avoided mode previously had a map pool", async ({
		page,
	}) => {
		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();

		// stage 2 is not banned in TC
		await matchProfile.maps.setModePreference("SZ", "Prefer");
		await matchProfile.maps.selectModeTab("SZ");
		await matchProfile.maps.mapButton("SZ", 1).click();
		await matchProfile.maps.setModePreference("TC", "Prefer");
		await matchProfile.maps.selectModeTab("TC");
		await matchProfile.maps.mapButton("TC", 2).click();
		await matchProfile.save();

		await matchProfile.maps.setModePreference("TW", "Avoid");
		await matchProfile.maps.setModePreference("TC", "Avoid");
		await matchProfile.maps.setModePreference("RM", "Avoid");
		await matchProfile.maps.setModePreference("CB", "Avoid");
		await matchProfile.save();

		// the previously saved TC pool must not resurface as an invalid "pool for an avoided mode"
		await matchProfile.goto();

		await matchProfile.save();
		await isNotVisible(matchProfile.locators.avoidedModePoolError);
	});
});

test.describe("Spoiler-free mode", () => {
	test("censors bracket and reveals on click", async ({ page, factories }) => {
		const tournament = await createFinalizedTournament(factories);

		await impersonate(page);
		const settings = new SettingsPage(page);
		await settings.enableSpoilerFreeMode();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		await expect(brackets.locators.showResultsButton).toBeVisible();

		await expect(brackets.locators.censoredTeamNames.first()).toBeVisible();

		await brackets.locators.showResultsButton.click();

		await expect(brackets.locators.hideResultsButton).toBeVisible();
		await isNotVisible(brackets.locators.censoredTeamNames);

		// the sessionStorage reveal carries over to the results page
		const results = new TournamentResultsPage(page);
		await results.goto(tournament.id);
		await expect(results.locators.resultTeamNames.first()).toBeVisible();
	});

	test("results page is censored and can be revealed", async ({
		page,
		factories,
	}) => {
		const tournament = await createFinalizedTournament(factories);

		await impersonate(page);
		const settings = new SettingsPage(page);
		await settings.enableSpoilerFreeMode();

		const results = new TournamentResultsPage(page);
		await results.goto(tournament.id);

		await expect(results.locators.showResultsButton).toBeVisible();
		await isNotVisible(results.locators.resultTeamNames);

		await results.locators.showResultsButton.click();
		await expect(results.locators.resultTeamNames.first()).toBeVisible();
	});
});

const TEAM_COUNT = 4;
const TEAM_SIZE = 4;

async function createFinalizedTournament(factories: Factories) {
	const users = await factories.UserFactory.createMany(TEAM_COUNT * TEAM_SIZE);
	const teamRosters = Array.from({ length: TEAM_COUNT }, (_, teamIndex) =>
		users
			.slice(teamIndex * TEAM_SIZE, (teamIndex + 1) * TEAM_SIZE)
			.map((user) => user.id),
	);

	return factories.TournamentFactory.createPlayed(
		{ authorId: ADMIN_ID },
		{ teamRosters, playedOut: "all" },
	);
}
