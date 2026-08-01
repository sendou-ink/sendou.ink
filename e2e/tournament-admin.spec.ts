import * as fs from "node:fs/promises";
import { addMinutes, subDays } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import {
	createTeams,
	DOUBLE_ELIMINATION,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { TournamentAdminAuditPage } from "./pages/tournament/tournament-admin-audit-page";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentAdminRegistrationPage } from "./pages/tournament/tournament-admin-registration-page";
import { TournamentSubsPage } from "./pages/tournament/tournament-subs-page";

const ROSTER_SIZE = 4;
const CAPTAIN_DISCORD_ID = "1234567890123456789";

test.describe("Tournament admin team management", () => {
	test("edits a registration, checks a team in and out, unregisters it and records it in the audit log", async ({
		page,
		factories,
	}) => {
		const tournament = await createTournament(factories);
		const roster = await factories.UserFactory.createMany(ROSTER_SIZE);
		const team = await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam("Original Team"),
			memberUserIds: roster.map((user) => user.id),
		});

		await impersonate(page, NZAP_TEST_ID);

		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoEdit(tournament.id, team.id);
		await expect(registration.locators.editHeading).toBeVisible();

		await registration.form.fill("pickUpName", "Renamed Team");
		await registration.save();

		// back on the team list, the rename is reflected
		const admin = new TournamentAdminPage(page);
		await expect(admin.locators.searchInput).toBeVisible();
		await expect(admin.teamName("Renamed Team")).toBeVisible();

		await admin.checkTeamIn(0);
		await admin.checkTeamOut(0);

		await admin.unregisterTeam(0);
		await expect(admin.locators.unregisterDialogHeading).toBeVisible();
		await admin.confirmUnregister();

		const audit = new TournamentAdminAuditPage(page);
		await audit.goto(tournament.id);
		await expect(audit.eventCell("Team checked in")).toBeVisible();
		await expect(audit.eventCell("Team checked out")).toBeVisible();
		await expect(audit.eventCell("Team unregistered")).toBeVisible();
	});

	test("adds a new team and records it in the audit log", async ({
		page,
		factories,
	}) => {
		const tournament = await createTournament(factories);
		const player = await factories.UserFactory.create({
			discordName: "Rostered Riko",
		});

		await impersonate(page, NZAP_TEST_ID);

		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoNew(tournament.id);
		await expect(registration.locators.addHeading).toBeVisible();

		await registration.form.fill("pickUpName", "Panda Squad");
		await registration.selectPlayer("Rostered Riko");
		await registration.selectCaptain(player.id);
		await registration.save();

		const admin = new TournamentAdminPage(page);
		await expect(admin.teamName("Panda Squad")).toBeVisible();

		const audit = new TournamentAdminAuditPage(page);
		await audit.goto(tournament.id);
		await expect(audit.eventCell("Team registered")).toBeVisible();
	});

	test("imports a roster from another tournament into the registration form", async ({
		page,
		factories,
	}) => {
		const tournament = await createTournament(factories);

		// the tournament search of the import dialog only finds past tournaments
		const pastTournament = await factories.TournamentFactory.create({
			name: "Paddling Pool 253",
			authorId: NZAP_TEST_ID,
			startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 2))],
		});
		const importedRoster = await factories.UserFactory.createMany(ROSTER_SIZE);
		await factories.TournamentTeamFactory.create({
			tournamentId: pastTournament.id,
			team: pickUpTeam("Imported Legends"),
			memberUserIds: importedRoster.map((user) => user.id),
		});

		await impersonate(page, NZAP_TEST_ID);

		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoNew(tournament.id);
		await expect(registration.locators.addHeading).toBeVisible();

		await registration.openImportDialog();
		await expect(registration.locators.importDialogHeading).toBeVisible();

		await registration.importFirstTeamFrom("Paddling Pool");

		// the dialog closes and the imported roster's name prefills the form
		await expect(registration.locators.importDialogHeading).toHaveCount(0);
		await expect(registration.locators.teamNameInput).toHaveValue(
			"Imported Legends",
		);
	});

	test("exports the team list", async ({ page, factories }) => {
		const tournament = await createTournament(factories);
		const roster = await factories.UserFactory.createMany(ROSTER_SIZE);
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam("Alpha Squad"),
			memberUserIds: roster.map((user) => user.id),
		});

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		await admin.openExportDialog();
		await expect(admin.locators.exportDialogHeading).toBeVisible();

		const download = await admin.downloadExport();

		expect(download.suggestedFilename()).toBe("participants.txt");

		const content = await fs.readFile(await download.path(), "utf-8");
		expect(content).toContain("Alpha Squad");
	});

	test("adds a sub post on behalf of a user", async ({ page, factories }) => {
		// registration is closed (start time in the past) so the subs view is shown on the looking page
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 1))],
		});
		await factories.UserFactory.create({
			discordName: "Subby Sam",
		});

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		await admin.openAddSubDialog();
		await expect(admin.locators.addSubDialogHeading).toBeVisible();

		await admin.addSubForm.selectUser("userId", "Subby Sam");
		await admin.addSubForm.fill("message", "Can play backline");
		await admin.addSubForm.submit();

		await expect(admin.locators.addSubDialogHeading).toHaveCount(0);

		const subs = new TournamentSubsPage(page);
		await subs.goto(tournament.id);
		await expect(subs.subPostText("Subby Sam")).toBeVisible();
		await expect(subs.subPostText("Can play backline")).toBeVisible();
	});

	test("adds a sub post on behalf of a user whose team dropped out", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
		});
		const dropout = await factories.UserFactory.create({
			discordName: "Dropout Dana",
		});
		const droppingRest = await factories.UserFactory.createMany(
			ROSTER_SIZE - 1,
		);
		await factories.TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				team: pickUpTeam("Recruiting Rays"),
				memberUserIds: [dropout.id, ...droppingRest.map((user) => user.id)],
			},
			// the team was recruiting on the LFG page before it dropped out
			{ isCheckedIn: true, isLooking: true },
		);
		// enough opponents that dropping out one team does not end every match
		await createTeams(factories, tournament.id, teamSeeds(3));
		await factories.TournamentFactory.startBracket(tournament.id);

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		await admin.searchTeams("Recruiting Rays");
		await admin.dropOutTeam(0);

		await admin.openAddSubDialog();
		await expect(admin.locators.addSubDialogHeading).toBeVisible();

		await admin.addSubForm.selectUser("userId", "Dropout Dana");
		await admin.addSubForm.fill("message", "Free to sub now");
		await admin.addSubForm.submit();

		await expect(admin.locators.addSubDialogHeading).toHaveCount(0);

		const subs = new TournamentSubsPage(page);
		await subs.goto(tournament.id);
		await expect(subs.subPostText("Dropout Dana")).toBeVisible();
		await expect(subs.subPostText("Free to sub now")).toBeVisible();
	});

	test("filters the team list by name and by captain Discord id", async ({
		page,
		factories,
	}) => {
		const tournament = await createTournament(factories);
		const captain = await factories.UserFactory.create({
			discordId: CAPTAIN_DISCORD_ID,
		});
		const alphaRest = await factories.UserFactory.createMany(ROSTER_SIZE - 1);
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam("Alpha Squad"),
			memberUserIds: [captain.id, ...alphaRest.map((user) => user.id)],
		});
		const bravoRoster = await factories.UserFactory.createMany(ROSTER_SIZE);
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam("Bravo Squad"),
			memberUserIds: bravoRoster.map((user) => user.id),
		});

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		// the captain is on no other team, so their team name + discord id both single it out
		await admin.searchTeams("Alpha Squad");
		await expect(admin.locators.teamRows).toHaveCount(1);
		await expect(admin.locators.teamNames.first()).toHaveText("Alpha Squad");

		await admin.searchTeams(CAPTAIN_DISCORD_ID);
		await expect(admin.locators.teamRows).toHaveCount(1);
		await expect(admin.locators.teamNames.first()).toHaveText("Alpha Squad");

		await admin.searchTeams("zzz-no-such-team-zzz");
		await expect(admin.locators.noSearchResultsText).toBeVisible();
	});
});

/** A tournament whose check-in window is open but that has not started. */
function createTournament(factories: Factories) {
	return factories.TournamentFactory.create({
		authorId: NZAP_TEST_ID,
		startTimes: [dateToDatabaseTimestamp(addMinutes(new Date(), 30))],
	});
}

function pickUpTeam(name: string) {
	return { name, prefersNotToHost: 0 as const, teamId: null };
}
