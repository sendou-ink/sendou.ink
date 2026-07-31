import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { WeaponBuildsPage } from "./pages/builds/weapon-builds-page";
import { CalendarPage } from "./pages/calendar/calendar-page";
import {
	MatchProfilePage,
	SELECTED_MAP_CLASS,
} from "./pages/settings/match-profile-page";
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
});

test.describe("Match profile map preferences", () => {
	test("retains map selection when toggling a mode prefer -> avoid -> prefer", async ({
		page,
	}) => {
		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();

		await matchProfile.setModePreference("SZ", "Prefer");
		await matchProfile.selectModeTab("SZ");
		await matchProfile.mapButton("SZ", 1).click();
		await expect(matchProfile.mapButton("SZ", 1)).toHaveClass(
			SELECTED_MAP_CLASS,
		);

		// avoiding hides the picker, but the selection should be remembered
		await matchProfile.setModePreference("SZ", "Avoid");
		await isNotVisible(matchProfile.mapButton("SZ", 1));

		await matchProfile.setModePreference("SZ", "Prefer");
		await matchProfile.selectModeTab("SZ");
		await expect(matchProfile.mapButton("SZ", 1)).toHaveClass(
			SELECTED_MAP_CLASS,
		);
	});

	test("can save 'zones only' after a now-avoided mode previously had a map pool", async ({
		page,
	}) => {
		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();

		// Save a map pool for both SZ and TC (stage 2 is not banned in TC).
		await matchProfile.setModePreference("SZ", "Prefer");
		await matchProfile.selectModeTab("SZ");
		await matchProfile.mapButton("SZ", 1).click();
		await matchProfile.setModePreference("TC", "Prefer");
		await matchProfile.selectModeTab("TC");
		await matchProfile.mapButton("TC", 2).click();
		await matchProfile.save();

		// Switch to "zones only" by avoiding every mode except SZ, then save.
		await matchProfile.setModePreference("TW", "Avoid");
		await matchProfile.setModePreference("TC", "Avoid");
		await matchProfile.setModePreference("RM", "Avoid");
		await matchProfile.setModePreference("CB", "Avoid");
		await matchProfile.save();

		// Reload so the form loads the persisted preferences. The previously saved
		// TC pool must not resurface as an invalid "pool for an avoided mode".
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

		// bracket is censored — "Show results" button visible
		await expect(brackets.locators.showResultsButton).toBeVisible();

		// later rounds show "???" for team names
		await expect(brackets.locators.censoredTeamNames.first()).toBeVisible();

		await brackets.locators.showResultsButton.click();

		// after reveal, "Hide results" button appears and "???" is gone
		await expect(brackets.locators.hideResultsButton).toBeVisible();
		await isNotVisible(brackets.locators.censoredTeamNames);

		// navigate to results page — sessionStorage reveal carries over
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

		// results are censored
		await expect(results.locators.showResultsButton).toBeVisible();
		await isNotVisible(results.locators.resultTeamNames);

		// reveal
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
