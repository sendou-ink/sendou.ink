import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	DOUBLE_ELIMINATION,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { NotificationsPage } from "./pages/notifications/notifications-page";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { UserResultsPage } from "./pages/user/user-results-page";

/* Match & round layout of a 4 team double elimination in a fresh database:
 * WB R1 = matches 1 & 2, WB final = 3, LB final (round id 3) = match 4. */
const DE_LOSERS_ROUND_ID = 3;

test.describe("Tournament bracket elimination", () => {
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
});
