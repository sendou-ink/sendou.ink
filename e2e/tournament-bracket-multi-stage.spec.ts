import { subMinutes } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	ROSTER_SIZE,
	RR_TO_SE,
	RR_TO_SE_WITH_UNDERGROUND,
	RR_TOP_4_TO_SE,
	SOS_BRACKETS,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { CalendarNewEventPage } from "./pages/calendar/calendar-new-event-page";
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

	// https://github.com/sendou-ink/sendou.ink/issues/2607
	test("seeds the follow-up single elimination so group rivals rematch as late as possible", async ({
		page,
		factories,
	}) => {
		await impersonate(page);
		const brackets = new TournamentBracketsPage(page);

		// 4 groups of 4, every team advancing -> 16 team single elimination
		const topFourTournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: RR_TOP_4_TO_SE,
		});
		await createTeams(factories, topFourTournament.id, teamSeeds(16));
		await factories.TournamentFactory.playOut(topFourTournament.id);

		await brackets.goto(topFourTournament.id);
		await brackets.bracketTab("Groups stage").click();
		const topFourGroups = await brackets.groupStandingsTeamNames(4);

		await brackets.bracketTab("Final stage").click();
		const topFourLineup = await brackets.firstRoundTeamNames(16);

		expectGroupsSpreadAcrossBracket(topFourLineup, topFourGroups);
		expectSeedOrderRespected(topFourLineup, topFourGroups);

		// 4 groups of 4, top 2 advancing -> 8 team single elimination
		const topTwoTournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: RR_TO_SE,
		});
		await createTeams(factories, topTwoTournament.id, teamSeeds(16));
		await factories.TournamentFactory.playOut(topTwoTournament.id);

		await brackets.goto(topTwoTournament.id);
		await brackets.bracketTab("Groups stage").click();
		const topTwoGroups = await brackets.groupStandingsTeamNames(4);

		await brackets.bracketTab("Final stage").click();
		const topTwoLineup = await brackets.firstRoundTeamNames(8);

		expectGroupsSpreadAcrossBracket(
			topTwoLineup,
			topTwoGroups.map((group) => group.slice(0, 2)),
		);
		expectSeedOrderRespected(
			topTwoLineup,
			topTwoGroups.map((group) => group.slice(0, 2)),
		);
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
		await eventEdit.makeAllBracketsStartingBrackets();

		await eventEdit.setBracketFormat(0, "Single elimination");
		await eventEdit.setBracketFormat(1, "Single elimination");
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

	test("plays out a redemption bracket set up in the tournament creation form", async ({
		page,
		factories,
	}) => {
		test.slow();
		const organizer = await factories.UserFactory.create(null, {
			roles: ["TOURNAMENT_ORGANIZER"],
		});

		await impersonate(page, organizer.id);

		const newTournament = new CalendarNewEventPage(page);
		await newTournament.gotoNewTournament();

		await newTournament.form.fill("name", "Redemption Arc");
		// start time in the past so the brackets can be started right away
		await newTournament.setFirstDate(subMinutes(new Date(), 30));

		await newTournament.form.select("toToolsMode", "TO");
		await newTournament.selectMapPoolTemplate("preset:SZ");

		// groups of 4: top 2 advance to the finals directly, 3rd placers get
		// another shot at the last finals spot through the redemption bracket
		await newTournament.renameBracket(0, "Groups");
		await newTournament.setBracketFormat(0, "Round robin");
		await newTournament.addFollowUpBracket({
			name: "Redemption",
			format: "Single elimination",
			placements: "3",
		});
		await newTournament.addFollowUpBracket({
			name: "Finals",
			format: "Single elimination",
			placements: "1-2",
		});
		await newTournament.addSourceToLastBracket("1");

		await newTournament.form.submit();

		await expect(page).toHaveURL(/\/to\/\d+/);
		const tournamentId = Number(page.url().match(/\/to\/(\d+)/)![1]);

		await createTeams(factories, tournamentId, teamSeeds(8));
		await factories.TournamentFactory.playOut(tournamentId, 0);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournamentId);

		await brackets.bracketTab("Groups").click();
		const groups = await brackets.groupStandingsTeamNames(2);
		const redemptionTeamNames = groups.map((group) => group[2]);

		// the finals can not be started before the redemption bracket has been played out
		await brackets.bracketTab("Finals").click();
		await expect(brackets.locators.teamsPendingFromSourcesText).toBeVisible();
		await isNotVisible(brackets.locators.finalizeBracketButton);

		await brackets.bracketTab("Redemption").click();
		await brackets.finalize();

		const redemptionMatchId = Number(
			await brackets.locators.matches.first().getAttribute("data-match-id"),
		);
		const redemptionMatch = await brackets.openMatch(redemptionMatchId);
		await redemptionMatch.openTab("action");
		await redemptionMatch.reportResultForTeam({
			teamName: redemptionTeamNames[0],
			mapsToReport: 3,
		});
		await redemptionMatch.backToBracket();

		await brackets.bracketTab("Finals").click();
		await isNotVisible(brackets.locators.teamsPendingFromSourcesText);
		await brackets.finalize();

		// the redemption bracket's winner took the last spot in the finals
		await expect(
			brackets.locators.bracketsViewer
				.getByText(redemptionTeamNames[0])
				.first(),
		).toBeVisible();
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

		// reuses the maps prepared for Great White
		await brackets.bracketTab("Hammerhead").click();

		await expect(brackets.locators.preparedMapsCheckIcon).toBeVisible();

		await brackets.bracketTab("Great White").click();

		const unlinkDialog = await brackets.openPrepareMapsDialog();
		await unlinkDialog.unlinkFinalsThirdPlaceMatch();
		await unlinkDialog.increaseMapCount("last");
		await unlinkDialog.confirm();

		await brackets.goto(tournament.id);
		await brackets.bracketTab("Great White").click();

		const relinkDialog = await brackets.openPrepareMapsDialog();

		// linking is offered again since the finals and third place match maps now differ
		await expect(relinkDialog.locators.linkFinalsButton).toBeVisible();
	});
});

/* With G groups feeding the bracket, every aligned section of G consecutive round 1
 * slots (quarter for 16 teams from 4 groups, half for 8) should hold one team from
 * each group; group rivals then can't rematch until the last log2(G) rounds. */
function expectGroupsSpreadAcrossBracket(lineup: string[], groups: string[][]) {
	for (let i = 0; i < lineup.length; i += groups.length) {
		const section = lineup.slice(i, i + groups.length);
		const sectionGroups = section.map((teamName) =>
			groupIndexOf(groups, teamName),
		);
		expect(new Set(sectionGroups).size).toBe(groups.length);
	}
}

/* Group placements must still decide the bracket seeds: every round 1 match pits a
 * placement tier against its mirror (1st vs 4th, 2nd vs 3rd when four advance) and
 * the two best group winners can only meet in the finals. */
function expectSeedOrderRespected(lineup: string[], groups: string[][]) {
	const tiersPerGroup = lineup.length / groups.length;
	const tierOf = (teamName: string) =>
		groups[groupIndexOf(groups, teamName)].indexOf(teamName) + 1;

	for (let i = 0; i < lineup.length; i += 2) {
		expect(tierOf(lineup[i]) + tierOf(lineup[i + 1])).toBe(tiersPerGroup + 1);
	}

	// the factory plays higher seeds to a win, so Teams 1 & 2 top their groups
	// with the best records overall
	expect(lineup.slice(0, lineup.length / 2)).toContain("Team 1");
	expect(lineup.slice(lineup.length / 2)).toContain("Team 2");
}

function groupIndexOf(groups: string[][], teamName: string) {
	const index = groups.findIndex((group) => group.includes(teamName));
	expect(index, `team ${teamName} not found in any group`).toBeGreaterThan(-1);
	return index;
}
