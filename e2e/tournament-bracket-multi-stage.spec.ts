import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	ROSTER_SIZE,
	RR_TO_SE,
	RR_TO_SE_WITH_UNDERGROUND,
	SOS_BRACKETS,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentAdminRegistrationPage } from "./pages/tournament/tournament-admin-registration-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentSeedsPage } from "./pages/tournament/tournament-seeds-page";
import { TournamentTeamsPage } from "./pages/tournament/tournament-teams-page";

test.describe("Tournament bracket multi stage", () => {
	test("completes and finalizes a small tournament (RR->SE w/ underground bracket)", async ({
		page,
		factories,
	}) => {
		const badges = await factories.BadgeFactory.createMany(2);
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: RR_TO_SE_WITH_UNDERGROUND,
			badges: badges.map((badge) => badge.id),
		});
		// groups of 3 and 4; the factory plays every match with the higher seed
		// winning, dropping teams 5, 6 and 7 into the underground bracket's placements
		const teams = await createTeams(factories, tournament.id, teamSeeds(7));
		await factories.TournamentFactory.playOut(tournament.id);

		// captain of one of the underground bracket teams
		await impersonate(page, teams[4].ownerUserId);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		await brackets.bracketTab("Underground").click();
		await brackets.checkInBracket();

		await impersonate(page);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		await admin.checkTeamInToBracket(teams[6].id, "Underground bracket");

		// the checked in teams meet in the underground bracket; score reporting and
		// starting brackets from the UI are covered by other tests
		await factories.TournamentFactory.playOut(tournament.id, [2, 1]);

		await brackets.goto(tournament.id);
		const finalizeDialog = await brackets.openFinalizeTournamentDialog();
		await finalizeDialog.assignBadgesLater();
		await finalizeDialog.confirm();

		// after finalizing the tournament, the admin tab disappears so the
		// reopen action is no longer reachable
		const match = await brackets.openMatch(11);
		await isNotVisible(match.locators.adminTab);
		await isNotVisible(match.locators.reopenMatchButton);
		await match.backToBracket();
	});

	test("shows tournament results on user profile after finalized tournament", async ({
		page,
		factories,
	}) => {
		// progression editing, score reporting and the finalize dialog are covered
		// by other tests; only the result pages themselves are under test here
		const players = await factories.UserFactory.createMany(ROSTER_SIZE * 2);
		const teamRosters = [
			players.slice(0, ROSTER_SIZE),
			players.slice(ROSTER_SIZE),
		].map((roster) => roster.map((player) => player.id));

		const tournament = await factories.TournamentFactory.createPlayed(
			{
				name: "Swim or Sink 101",
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression: RR_TO_SE,
			},
			{ teamRosters, playedOut: "all" },
		);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const results = await brackets.nav.openResults();
		await results.expandTeam(0);
		const userPage = await results.openMember(0);

		await userPage.openSeasons();
		await expect(userPage.locators.seasonsTournamentResult).toBeVisible();

		const userResults = await userPage.openResults();
		await expect(
			userResults.locators.tournamentNameCells.first(),
		).toContainText("Swim or Sink 101");

		await userResults.openMates(0);
		await expect(userResults.matesListItems(0)).toHaveCount(3);
	});

	test("changes SOS format and progresses with it & adds a member to another team", async ({
		page,
		factories,
	}) => {
		test.slow();
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SOS_BRACKETS,
			mapPoolMaps: TO_MAP_POOL,
		});
		// the to-be double registrant plays in Sendou's team; the admin add
		// flow requires a friend code, which the admin user itself lacks
		const doubleRegistrant = await factories.UserFactory.create({
			discordName: "Duplicate Dave",
		});
		const teams = await createTeams(factories, tournament.id, [
			{ members: [ADMIN_ID, doubleRegistrant.id] },
			...teamSeeds(3),
		]);

		await impersonate(page);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		const eventEdit = await admin.editEventInfo();
		await eventEdit.deleteLastBracket();
		await eventEdit.fillLastPlacements("3,4");
		await eventEdit.save();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		// every match of the group but one that Sendou's team is not part of
		for (const matchId of [1, 2, 3, 4, 6]) {
			const match = await brackets.openMatch(matchId);
			await match.openTab("action");
			await match.reportResult({ mapsToReport: 2 });
			await match.backToBracket();
		}

		await expect(brackets.locators.waitingOnGroupText).toBeVisible();

		const lastGroupsMatch = await brackets.openMatch(5);
		await lastGroupsMatch.openTab("action");
		await lastGroupsMatch.reportResult({ mapsToReport: 2 });
		await lastGroupsMatch.backToBracket();

		await brackets.bracketTab("Hammerhead").click();
		await isNotVisible(brackets.locators.bracketsViewer);

		await brackets.bracketTab("Mako").click();
		await expect(brackets.locators.bracketsViewer).toBeVisible();

		await brackets.finalize();

		const makoMatch = await brackets.openMatch(7);
		await expect(makoMatch.locators.backToBracketButton).toBeVisible();

		// add a player of the first team also to the third team (a team in the Mako bracket)
		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoEdit(tournament.id, teams[2].id);
		await registration.addMember("Duplicate Dave");
		await registration.save();

		const teamsPage = new TournamentTeamsPage(page);
		await teamsPage.goto(tournament.id);

		await expect(teamsPage.memberNamed("Duplicate Dave")).toHaveCount(2);
	});

	test("conducts a tournament with many starting brackets", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SOS_BRACKETS,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(16));

		await impersonate(page);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		const eventEdit = await admin.editEventInfo();
		await eventEdit.deleteLastBracket();
		await eventEdit.toggleFollowUpBracketSwitches();

		await eventEdit.setBracketFormat(0, "Single-elimination");
		await eventEdit.setBracketFormat(1, "Single-elimination");
		await eventEdit.setBracketFormat(2, "Swiss");
		await eventEdit.setBracketFormat(3, "Swiss");

		await eventEdit.save();

		const seeds = new TournamentSeedsPage(page);
		await seeds.goto(tournament.id);
		await seeds.openStartingBracketsDialog();

		for (let i = 0; i < 16; i++) {
			let bracketName: string;
			if (i < 4) {
				bracketName = "Groups stage";
			} else if (i < 8) {
				bracketName = "Great White";
			} else if (i < 12) {
				bracketName = "Hammerhead";
			} else {
				bracketName = "Mako";
			}

			await seeds.setStartingBracket(i, bracketName);
		}

		await seeds.saveStartingBrackets();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		for (const bracketName of [
			"Groups stage",
			"Great White",
			"Hammerhead",
			"Mako",
		]) {
			await brackets.bracketTab(bracketName).click();
			await brackets.finalize();
		}

		await expect(brackets.match(11)).toBeVisible();
	});

	test("prepares maps (including third place match linking)", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SOS_BRACKETS,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		await brackets.bracketTab("Great White").click();

		const prepareDialog = await brackets.openPrepareMapsDialog();
		await prepareDialog.setExpectedTeams(8);
		await prepareDialog.confirm();

		await brackets.goto(tournament.id);
		await brackets.bracketTab("Great White").click();

		await expect(brackets.locators.preparedMapsCheckIcon).toBeVisible();

		// we did not prepare maps for group stage
		await brackets.bracketTab("Groups stage").click();

		await isNotVisible(brackets.locators.preparedMapsCheckIcon);

		// should reuse prepared maps from Great White
		await brackets.bracketTab("Hammerhead").click();

		await expect(brackets.locators.preparedMapsCheckIcon).toBeVisible();

		// finally, test third place match linking
		await brackets.bracketTab("Great White").click();

		const unlinkDialog = await brackets.openPrepareMapsDialog();
		await unlinkDialog.unlinkFinalsThirdPlaceMatch();
		await unlinkDialog.increaseMapCount("last");
		await unlinkDialog.confirm();

		await brackets.goto(tournament.id);
		await brackets.bracketTab("Great White").click();

		const relinkDialog = await brackets.openPrepareMapsDialog();

		// link button should be visible because we unlinked and made finals and third place match maps different earlier
		await expect(relinkDialog.locators.linkFinalsButton).toBeVisible();
	});
});
