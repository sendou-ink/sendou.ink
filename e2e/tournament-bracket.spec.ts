import { subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import type { TournamentSettings } from "~/db/tables-json";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { NotificationsPage } from "./pages/notifications/notifications-page";
import { MatchProfilePage } from "./pages/settings/match-profile-page";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentAdminRegistrationPage } from "./pages/tournament/tournament-admin-registration-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentJoinPage } from "./pages/tournament/tournament-join-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";
import { TournamentPage } from "./pages/tournament/tournament-page";
import { TournamentSeedsPage } from "./pages/tournament/tournament-seeds-page";
import { TournamentTeamsPage } from "./pages/tournament/tournament-teams-page";
import { UserResultsPage } from "./pages/user/user-results-page";

const ROSTER_SIZE = 4;

type BracketProgression = TournamentSettings["bracketProgression"];

const DOUBLE_ELIMINATION: BracketProgression = [
	{
		type: "double_elimination",
		name: "Main bracket",
		requiresCheckIn: false,
		settings: {},
	},
];

/* Match & round layout of a 4 team double elimination in a fresh database:
 * WB R1 = matches 1 & 2, WB final = 3, LB final (round id 3) = match 4. */
const DE_LOSERS_ROUND_ID = 3;

const ROUND_ROBIN: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
];

/* Single group of 4 teams plays: R1 = matches 1 (team 1 vs. 4) & 2 (team 3 vs. 2),
 * R2 = matches 3 (team 2 vs. 4) & 4 (team 1 vs. 3), R3 = matches 5 & 6 (team 2 vs. 1). */

const RR_TO_SE: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
	{
		type: "single_elimination",
		name: "Final stage",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
];

const RR_TO_SE_WITH_UNDERGROUND: BracketProgression = [
	...RR_TO_SE,
	{
		type: "single_elimination",
		name: "Underground bracket",
		requiresCheckIn: true,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [3, 4] }],
	},
];

const SOS_BRACKETS: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
	{
		type: "single_elimination",
		name: "Great White",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1] }],
	},
	{
		type: "single_elimination",
		name: "Hammerhead",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [2] }],
	},
	{
		type: "single_elimination",
		name: "Mako",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [3] }],
	},
	{
		type: "single_elimination",
		name: "Lantern",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [4] }],
	},
];

const SWISS_TO_TOP_CUT: BracketProgression = [
	{
		type: "swiss",
		name: "Swiss",
		requiresCheckIn: false,
		settings: { groupCount: 2, roundCount: 4 },
	},
	{
		type: "single_elimination",
		name: "Top Cut",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
		sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
	},
];

const TO_MAP_POOL = ([1, 2, 3, 4, 6, 7, 8, 10] as StageId[]).flatMap(
	(stageId) =>
		(["SZ", "TC", "RM", "CB"] as ModeShort[]).map((mode) => ({
			mode,
			stageId,
		})),
);

test.describe("Tournament bracket", () => {
	test("sets active roster as regular member", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
		});
		// the team with subs is created second, making it the bravo side of the match
		const [, teamWithSub] = await createTeams(factories, tournament.id, [
			{},
			{ rosterSize: 5 },
		]);
		const [match] = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		await impersonate(page, teamWithSub.ownerUserId);

		const matchPage = new TournamentMatchPage(page);
		await matchPage.goto({ tournamentId: tournament.id, matchId: match.id });

		await expect(matchPage.locators.activeRosterNeededText).toBeVisible();

		// The roster tab opens in editing mode by default when active roster is missing.
		await matchPage.openTab("rosters");
		await matchPage.playerCheckbox("bravo", 0).click();
		await matchPage.playerCheckbox("bravo", 1).click();
		await matchPage.playerCheckbox("bravo", 2).click();
		await matchPage.playerCheckbox("bravo", 3).click();
		await matchPage.saveActiveRoster("bravo");

		// did it persist?
		await matchPage.goto({ tournamentId: tournament.id, matchId: match.id });
		await isNotVisible(matchPage.locators.activeRosterNeededText);

		await matchPage.openTab("rosters");
		await matchPage.editActiveRosterButton("bravo").click();
		// Swap player 3 out for player 4
		await matchPage.playerCheckbox("bravo", 3).click();
		await matchPage.playerCheckbox("bravo", 4).click();
		await matchPage.saveActiveRoster("bravo");

		await expect(matchPage.editActiveRosterButton("bravo")).toBeVisible();
	});

	// 1) Report winner of N-ZAP's first match
	// 2) Report winner of the adjacent match by using admin powers
	// 3) Report one match on the only losers side match available
	// 4) Try to reopen N-ZAP's first match and fail
	// 5) Undo score of first losers match
	// 6) Try to reopen N-ZAP's first match and succeed
	// 7) As N-ZAP, undo all scores and switch to different team sweeping
	test("reports score and sees bracket update", async ({ page, factories }) => {
		test.slow();
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
		});
		const teams = await createTeams(factories, tournament.id, [
			{ members: [NZAP_TEST_ID] },
			...teamSeeds(3),
		]);
		const matches = await factories.TournamentFactory.startBracket(
			tournament.id,
		);
		const nzapsMatchId = matches[0].id;
		const adjacentMatchId = matches[1].id;
		const losersMatchId = matches[3].id;

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		// 1)
		let match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// 2)
		match = await brackets.openMatch(adjacentMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// 3)
		match = await brackets.openMatch(losersMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });
		await match.backToBracket();

		// 4)
		match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("admin");
		await isNotVisible(match.locators.reopenMatchButton);
		await match.backToBracket();

		// 5)
		match = await brackets.openMatch(losersMatchId);
		await match.openTab("action");
		await match.undoLastReport();
		await expect(match.score([0, 0])).toBeVisible();
		await match.backToBracket();

		// 6)
		match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("admin");
		await match.reopen();
		await expect(match.score([1, 0])).toBeVisible();

		// 7)
		await impersonate(page, NZAP_TEST_ID);
		await brackets.goto(tournament.id);
		match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("action");
		await match.undoLastReport();
		await expect(match.score([0, 0])).toBeVisible();
		await match.reportResult({ mapsToReport: 2, winner: 2 });
		await match.backToBracket();
		await expect(
			brackets.participantInRound(DE_LOSERS_ROUND_ID, teams[0].id),
		).toBeVisible();
	});

	test("adds a sub mid tournament", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
		});
		const teams = await createTeams(factories, tournament.id, teamSeeds(3));
		await factories.TournamentFactory.startBracket(tournament.id);
		const sub = await factories.UserFactory.create();

		// captain of the last seeded team
		await impersonate(page, teams[2].ownerUserId);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const inviteLink = await brackets.copySubInviteLink();

		await impersonate(page, sub.id);

		const join = new TournamentJoinPage(page);
		await join.gotoViaInviteLink(inviteLink);
		await join.join();

		await expect(page).toHaveURL(/brackets/);
	});

	test("completes and finalizes a small tournament with badge assigning", async ({
		page,
		factories,
	}) => {
		test.slow();

		const badges = await factories.BadgeFactory.createMany(2);
		const tournament = await factories.TournamentFactory.create({
			name: "In The Zone 22",
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
			mapPoolMaps: TO_MAP_POOL,
			badges: badges.map((badge) => badge.id),
		});
		const teams = await createTeams(factories, tournament.id, [
			{ members: [ADMIN_ID] },
			{},
		]);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		const match = await brackets.openMatch(1);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		const finalizeDialog = await brackets.openFinalizeTournamentDialog();
		await finalizeDialog.selectBadgeReceiver(0, teams[0].id);
		await finalizeDialog.selectBadgeReceiver(1, teams[1].id);
		await finalizeDialog.confirm();

		const results = await brackets.nav.openResults();
		// seed performance rating shows up after tournament is finalized
		await expect(results.locators.sprHeader).toBeVisible();

		const userResults = new UserResultsPage(page);
		await userResults.goto(ADMIN_DISCORD_ID);

		await expect(userResults.tournamentName("In The Zone 22")).toBeVisible();

		const notifications = new NotificationsPage(page);
		await notifications.goto();

		await expect(notifications.locators.items.first()).toContainText(
			"New badge",
		);
	});

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

	test("starts a round robin bracket with unevenly sized groups (5 teams)", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: RR_TO_SE_WITH_UNDERGROUND,
			mapPoolMaps: TO_MAP_POOL,
		});
		// 5 checked in teams -> groups of 3 and 2 with different round counts
		await createTeams(factories, tournament.id, teamSeeds(5));

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		// bracket starts without an "Invalid map count" error -> matches are rendered
		await expect(brackets.locators.matches.first()).toBeVisible();
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

	test("organizer edits a match after it is done", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, [
			{ rosterSize: 5 },
			{ rosterSize: 5 },
		]);

		await impersonate(page);

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		const brackets = await tournamentPage.nav.openBrackets();
		await brackets.finalize();

		const match = await brackets.openMatch(1);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });

		await match.openTab("admin");
		await match.editResultButton(0).click();
		// Swap player 3 out for player 4 on the alpha (winner) team
		await match.editResultPlayerCheckbox("alpha", 3).click();
		await match.editResultPlayerCheckbox("alpha", 4).click();
		// Toggle KO so we can verify the edit went through (RR collects KO).
		await match.locators.koCheckbox.check();
		await match.saveResult(0);

		// Edit returns to read-only view, now showing the KO label
		await expect(match.editResultButton(0)).toBeVisible();
		await expect(match.locators.koResultText).toBeVisible();
	});

	test("changes to picked map pool & best of", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(2));

		await impersonate(page);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		const eventEdit = await admin.editEventInfo();
		await eventEdit.clearMapPool();
		await eventEdit.selectMapPoolTemplate("preset:CB");
		await eventEdit.save();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		const mapListDialog = await brackets.openFinalizeDialog();
		await mapListDialog.increaseMapCount("first");
		await mapListDialog.confirm();

		const match = await brackets.openMatch(1);
		// Bo5 of clam blitz: one mode icon + ×5 count text
		await expect(match.modeProgress("CB")).toBeVisible();
		await expect(match.mapCountText(5)).toBeVisible();
	});

	test("reopens round robin match and changes score", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));

		// set situation where match A is completed and its participants also completed
		// their follow up matches B & C and then we go back and change the winner of A:
		// the two passes play rounds 1 (matches 1 & 2) and 2 (matches 3 & 4)
		await factories.TournamentFactory.startBracket(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const match = await brackets.openMatch(2);
		await match.openTab("admin");
		await match.reopen();
		// Wait for the reopen to be reflected before switching tabs: switching
		// tabs is a `defaultShouldRevalidate: false` navigation that would abort
		// the still-in-flight post-reopen loader revalidation, leaving the match
		// stuck as "over" so the action tab never appears.
		await isNotVisible(match.locators.reopenMatchButton);
		await match.openTab("action");
		await match.undoLastReport();
		await match.reportResult({
			mapsToReport: 2,
			winner: 2,
			setEnds: true,
		});
	});

	test("reopening round robin match does not lock already-unlocked matches (issue #2690)", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));

		// Complete R1 matches (1 and 2) to unlock R2 matches
		await factories.TournamentFactory.startBracket(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		// Match 3 is R2 - should now be unlocked since R1 is complete
		// Start it but don't complete it
		let match = await brackets.openMatch(3);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });
		await match.backToBracket();

		// Reopen match 1 (R1 match) - simulating a score misreport correction
		match = await brackets.openMatch(1);
		await match.openTab("admin");
		await match.reopen();
		await match.backToBracket();

		// Verify the R2 match that was already in progress is still playable
		// Before the fix, this would become locked and unplayable
		match = await brackets.openMatch(3);
		await expect(match.score([1, 0])).toBeVisible();
		await match.openTab("action");
		await expect(match.winnerRadio(1)).toBeVisible();
	});

	test("locks/unlocks matches & sets match as casted", async ({
		page,
		factories,
	}) => {
		test.slow();

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));

		await impersonate(page);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		const stream = await admin.openStream();
		// an empty array field already renders one placeholder input
		await stream.fillAccount(0, "test");
		await stream.save();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		let match = await brackets.openMatch(1);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// match 3 is the winners' final the winner of match 1 waits in
		match = await brackets.openMatch(3);
		await match.openTab("admin");
		// Picking a chip auto-submits the cast channel; lock the match afterwards.
		await match.setCastedBy("test");
		await match.submitCastInfo();
		await match.backToBracket();

		match = await brackets.openMatch(2);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		await expect(brackets.locators.castBadges.first()).toBeVisible();
		match = await brackets.openMatch(3);
		await match.openTab("admin");
		// Lock state is signalled by the toggle being "Unlock" instead of "Lock"
		await expect(match.locators.unlockButton).toBeVisible();
		// A locked match still needs to show the pool & room pass so players can join
		await expect(match.locators.poolLabel).toBeVisible();
		await expect(match.locators.roomPass).toBeVisible();
		await match.submitCastInfo();
		await expect(match.locators.stageBanner).toBeVisible();

		// Cast channel "test" persists across unlock; the bracket badge flips
		// from 🔒 CAST to 🔴 LIVE once the match is unlocked and ongoing.
		await match.backToBracket();
		await expect(brackets.locators.liveBadges.first()).toBeVisible();
	});

	test("resets bracket", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
			mapPoolMaps: TO_MAP_POOL,
		});
		// the top seed has not checked in, leaving 15 teams and a first round bye
		await createTeams(factories, tournament.id, [
			{ isCheckedIn: false },
			...teamSeeds(15),
		]);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		await isNotVisible(brackets.match(1));
		const match = await brackets.openMatch(2);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });

		const admin = await match.nav.openAdmin();
		await admin.resetBracket("Main bracket");

		await admin.adminTab("Teams").click();
		// check the top seed back in
		await admin.checkTeamIn(0);

		const bracketsAfterReset = await admin.nav.openBrackets();
		await bracketsAfterReset.finalize();
		// bye is gone
		await expect(bracketsAfterReset.match(1)).toBeVisible();
	});

	test("user no screen setting affects tournament match", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
			enableNoScreenToggle: true,
		});
		await createTeams(factories, tournament.id, [
			{ members: [ADMIN_ID] },
			...teamSeeds(3),
		]);

		await impersonate(page);

		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();
		await matchProfile.form.check("noScreen");
		await matchProfile.save();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		// match 1 has Sendou's team in it, match 2 does not
		const ownMatch = await brackets.openMatch(1);
		await expect(ownMatch.locators.screenBanned).toBeVisible();

		await ownMatch.backToBracket();
		const otherMatch = await brackets.openMatch(2);
		await expect(otherMatch.locators.screenAllowed).toBeVisible();
	});

	test("hosts a 'play all' round robin stage", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(2));

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		const mapListDialog = await brackets.openFinalizeDialog();
		await mapListDialog.setCountType("PLAY_ALL");
		await mapListDialog.confirm();

		const match = await brackets.openMatch(1);
		await expect(match.playAllText(3)).toBeVisible();
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 3 });
	});

	test("swiss tournament with bracket advancing/unadvancing & dropping out a team", async ({
		page,
		factories,
	}) => {
		test.slow();

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SWISS_TO_TOP_CUT,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(16));

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		// report all group A round 1 scores
		for (const matchId of [1, 2, 3, 4]) {
			const match = await brackets.openMatch(matchId);
			await match.openTab("action");
			await match.reportResult({ mapsToReport: 2 });
			await match.backToBracket();
		}

		// test that we can change to view different group
		await expect(brackets.locators.startRoundButton).toBeVisible();
		await brackets.openGroup("B");
		await isNotVisible(brackets.locators.startRoundButton);
		await brackets.openGroup("A");

		await brackets.startRound();
		await expect(brackets.match(9)).toBeVisible();

		const admin = await brackets.nav.openAdmin();
		// drop out the top seed, playing in group A
		await admin.dropOutTeam(0);

		await brackets.goto(tournament.id);

		await brackets.resetRound();
		await brackets.startRound();
		await expect(brackets.locators.byeTeam).toBeVisible();
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

	for (const pickBan of ["COUNTERPICK", "BAN_2"]) {
		test(`ban/pick ${pickBan}`, async ({ page, factories }) => {
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression: ROUND_ROBIN,
				mapPoolMaps: TO_MAP_POOL,
			});
			const teams = await createTeams(factories, tournament.id, teamSeeds(4));
			// match 2 of the group has the third team as alpha and the second as bravo
			const matchId = 2;
			const teamOneCaptainId = teams[2].ownerUserId;
			const teamTwoCaptainId = teams[1].ownerUserId;

			await impersonate(page);

			const brackets = new TournamentBracketsPage(page);
			await brackets.goto(tournament.id);
			const mapListDialog = await brackets.openFinalizeDialog();
			await mapListDialog.setPickBan(pickBan);
			await mapListDialog.confirm();

			const match = new TournamentMatchPage(page);

			if (pickBan === "BAN_2") {
				for (const captainId of [teamTwoCaptainId, teamOneCaptainId]) {
					await impersonate(page, captainId);
					await match.goto({ tournamentId: tournament.id, matchId });
					await match.openTab("action");

					await match.pickBan();
				}

				// once both teams banned the ban prompt is gone and the actual map
				// banner takes over.
				await expect(match.locators.stageBanner).toBeVisible();
			}

			await impersonate(page, teamOneCaptainId);
			await match.goto({ tournamentId: tournament.id, matchId });

			await match.openTab("action");
			await match.reportResult({ mapsToReport: 1, winner: 2, setEnds: false });

			if (pickBan === "COUNTERPICK") {
				await match.pickBan();
			}

			await impersonate(page, teamTwoCaptainId);
			await match.goto({ tournamentId: tournament.id, matchId });

			await match.openTab("action");
			await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });

			if (pickBan === "COUNTERPICK") {
				await match.pickBan();

				await match.undoLastReport();
				await expect(match.locators.selectWinnerText).toBeVisible();
				await match.reportResult({
					mapsToReport: 1,
					winner: 1,
					setEnds: false,
				});
				await expect(match.locators.counterpickText).toBeVisible();
				await match.pickBan("last");
				await expect(match.locators.selectWinnerText).toBeVisible();
				await expect(match.score([1, 1])).toBeVisible();
			}
		});
	}

	test("can end set early when past time limit and shows timer on bracket and match page", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
		});
		await createTeams(factories, tournament.id, teamSeeds(2));
		const [{ id: matchId }] = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		let match = await brackets.openMatch(matchId);

		await page.clock.install({ time: new Date() });

		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });

		await expect(match.locators.matchTimer).toBeVisible();

		await match.backToBracket();

		await expect(brackets.match(matchId)).toBeVisible();

		// Verify timer shows on bracket page (timer is a sibling of the match link)
		await expect(brackets.matchTimer(matchId)).toBeVisible();

		// Fast forward time past limit (30 minutes for Bo3 = 26min limit)
		await page.clock.fastForward("30:00");
		await page.reload();

		match = await brackets.openMatch(matchId);

		await match.openTab("admin");
		await match.endSetWithRandomWinner();

		// Match is now finalized (no longer ongoing) → "Final" appears in banner
		await expect(match.locators.finalBanner).toBeVisible();
	});

	test("dropping team out ends ongoing match early and auto-forfeits losers bracket match", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		const matches = await factories.TournamentFactory.startBracket(
			tournament.id,
		);
		const ongoingMatchId = matches[0].id;
		const adjacentMatchId = matches[1].id;
		const losersMatchId = matches[3].id;

		await impersonate(page);

		// 1) Report partial score on the first winners bracket match
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		let match = await brackets.openMatch(ongoingMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await match.backToBracket();

		// 2) Drop the fourth team (the bravo side of the ongoing match) via admin
		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		await admin.dropOutTeam(3);

		// 3) Verify the ongoing match ended early (no longer ongoing → "Final")
		await match.goto({ tournamentId: tournament.id, matchId: ongoingMatchId });
		await expect(match.locators.finalBanner).toBeVisible();
		await match.backToBracket();

		// 4) Complete the adjacent match so its loser goes to losers bracket
		match = await brackets.openMatch(adjacentMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// 5) The losers bracket match should now have teams:
		//    - Loser of the first match (the dropped team)
		//    - Loser of the adjacent match
		//    It should have ended early since the dropped team is in it
		match = await brackets.openMatch(losersMatchId);
		await expect(match.locators.finalBanner).toBeVisible();
	});

	test("ban/pick CUSTOM flow", async ({ page, factories }) => {
		test.slow();
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
		});
		const teams = await createTeams(factories, tournament.id, teamSeeds(4));
		// match 2 of the group has the third team (lower seed) as alpha and the
		// second team (higher seed) as bravo
		const matchId = 2;
		const higherSeedCaptainId = teams[1].ownerUserId;
		const lowerSeedCaptainId = teams[2].ownerUserId;

		const customFlow = {
			preSet: [
				{ action: "BAN", side: "HIGHER_SEED" },
				{ action: "BAN", side: "HIGHER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "ROLL" },
			],
			postGame: [
				{ action: "BAN", side: "WINNER" },
				{ action: "BAN", side: "WINNER" },
				{ action: "PICK", side: "LOSER" },
			],
		};

		// 1) Start bracket with CUSTOM pick/ban flow
		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const mapListDialog = await brackets.openFinalizeDialog();
		await mapListDialog.setPickBan("CUSTOM");
		await expect(mapListDialog.locators.beforeSetText).toBeVisible();
		await mapListDialog.confirmWithCustomFlow(customFlow);

		const match = new TournamentMatchPage(page);

		// 2) PreSet: Higher seed bans 2 maps
		await impersonate(page, higherSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// 3) PreSet: Lower seed bans 2 maps
		await impersonate(page, lowerSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// 4) Roll auto-executed after last ban; report game 1 score
		await expect(match.locators.stageBanner).toBeVisible();
		await match.openTab("action");

		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await expect(match.score([1, 0])).toBeVisible();

		// 5) PostGame: Winner (the alpha team, whose captain is still impersonated) bans 2 maps
		await expect(match.locators.banAMapText).toBeVisible();
		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// PostGame: Loser (the bravo team) picks a map
		await impersonate(page, higherSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await expect(match.locators.pickAMapText).toBeVisible();
		await match.pickBan();

		// 6) Undo game 1 score — also deletes postGame pick/ban events
		await expect(match.locators.stageBanner).toBeVisible();
		await match.undoLastReport();

		await expect(match.score([0, 0])).toBeVisible();
		await expect(match.locators.stageBanner).toBeVisible();

		// 7) Re-report game 1 and verify postGame cycle restarts
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await expect(match.score([1, 0])).toBeVisible();

		await expect(match.locators.banAMapText).toBeVisible();
	});
});

type TeamSeed = {
	/** Users put on the roster ahead of freshly created filler users. */
	members?: number[];
	rosterSize?: number;
	isCheckedIn?: boolean;
};

/** `count` checked in teams with full rosters of fresh users. */
function teamSeeds(count: number): TeamSeed[] {
	return Array.from({ length: count }, () => ({}));
}

/** Registers a team per seed, named by seeding order ("Team 1", "Team 2", ...). */
async function createTeams(
	factories: Factories,
	tournamentId: number,
	seeds: TeamSeed[],
) {
	const teams = [];
	for (const [i, seed] of seeds.entries()) {
		const presetMembers = seed.members ?? [];
		const rosterSize = seed.rosterSize ?? ROSTER_SIZE;
		const fillerUsers = await factories.UserFactory.createMany(
			rosterSize - presetMembers.length,
		);
		teams.push(
			await factories.TournamentTeamFactory.create(
				{
					tournamentId,
					team: {
						name: `Team ${i + 1}`,
						prefersNotToHost: 0 as const,
						teamId: null,
					},
					memberUserIds: [
						...presetMembers,
						...fillerUsers.map((user) => user.id),
					],
				},
				{ isCheckedIn: seed.isCheckedIn ?? true },
			),
		);
	}
	return teams;
}

/** A start time in the past: check-in is over and brackets can be started from the UI. */
function startedTournamentTimes() {
	return [dateToDatabaseTimestamp(subMinutes(new Date(), 30))];
}
