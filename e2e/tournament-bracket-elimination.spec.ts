import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
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

		// report winner of N-ZAP's first match
		let match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// report winner of the adjacent match using admin powers
		match = await brackets.openMatch(adjacentMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// report one map of the only losers side match available
		match = await brackets.openMatch(losersMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });
		await match.backToBracket();

		// N-ZAP's first match can't be reopened while the losers match depends on it
		match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("admin");
		await isNotVisible(match.locators.reopenMatchButton);
		await match.backToBracket();

		// undo the losers match score
		match = await brackets.openMatch(losersMatchId);
		await match.openTab("action");
		await match.undoLastReport();
		await expect(match.score([0, 0])).toBeVisible();
		await match.backToBracket();

		// now the reopen succeeds
		match = await brackets.openMatch(nzapsMatchId);
		await match.openTab("admin");
		await match.reopen();
		await expect(match.score([1, 0])).toBeVisible();

		// as N-ZAP, undo every score and let the other team sweep instead
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

	test("losers bracket team winning grand finals forces a bracket reset", async ({
		page,
		factories,
	}) => {
		test.slow();

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DOUBLE_ELIMINATION,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		const [wbSemiOne, wbSemiTwo, wbFinal, lbSemi, lbFinal, grandFinals, reset] =
			await factories.TournamentFactory.startBracket(tournament.id);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		// every match up to grand finals is swept by whichever team is on the alpha
		// side, leaving the winners bracket team facing the team it beat in the
		// winners final
		for (const { id } of [wbSemiOne, wbSemiTwo, wbFinal, lbSemi, lbFinal]) {
			const match = await brackets.openMatch(id);
			await match.openTab("action");
			await match.reportResult({ mapsToReport: 2 });
			await match.backToBracket();
		}

		// the losers bracket team (bravo side of grand finals) takes the first set,
		// which is only enough to even out the sets lost
		let match = await brackets.openMatch(grandFinals.id);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2, winner: 2 });
		await match.backToBracket();

		await expect(
			brackets.roundHeader(TOURNAMENT.ROUND_NAMES.BRACKET_RESET),
		).toBeVisible();
		await isNotVisible(brackets.locators.finalizeTournamentButton);

		match = await brackets.openMatch(reset.id);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		await expect(brackets.locators.finalizeTournamentButton).toBeVisible();
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
		// picking a chip auto-submits the cast channel
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
		// the toggle reading "Unlock" is what signals the locked state
		await expect(match.locators.unlockButton).toBeVisible();
		// a locked match still shows the pool & room pass so players can join
		await expect(match.locators.poolLabel).toBeVisible();
		await expect(match.locators.roomPass).toBeVisible();
		await match.submitCastInfo();
		await expect(match.locators.stageBanner).toBeVisible();

		// the cast channel persists across unlock; the bracket badge flips from CAST to LIVE
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

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		let match = await brackets.openMatch(ongoingMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await match.backToBracket();

		// the fourth team is the bravo side of the ongoing match
		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		await admin.dropOutTeam(3);

		// dropping out ended the ongoing match early
		await match.goto({ tournamentId: tournament.id, matchId: ongoingMatchId });
		await expect(match.locators.finalBanner).toBeVisible();
		await match.backToBracket();

		// completing the adjacent match sends its loser to the losers bracket
		match = await brackets.openMatch(adjacentMatchId);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 2 });
		await match.backToBracket();

		// the losers match, now holding the dropped team, ended early as well
		match = await brackets.openMatch(losersMatchId);
		await expect(match.locators.finalBanner).toBeVisible();
	});
});
