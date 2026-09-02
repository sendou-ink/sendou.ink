import type { Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { openSecondUser } from "./helpers/chat";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createInProgressMatch,
	createTeams,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentJoinPage } from "./pages/tournament/tournament-join-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

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

		// the roster tab opens in editing mode while the active roster is missing
		await matchPage.openTab("rosters");
		await matchPage.playerCheckbox("bravo", 0).click();
		await matchPage.playerCheckbox("bravo", 1).click();
		await matchPage.playerCheckbox("bravo", 2).click();
		await matchPage.playerCheckbox("bravo", 3).click();
		await matchPage.saveActiveRoster("bravo");

		await matchPage.goto({ tournamentId: tournament.id, matchId: match.id });
		await isNotVisible(matchPage.locators.activeRosterNeededText);

		await matchPage.openTab("rosters");
		await matchPage.editActiveRosterButton("bravo").click();
		await matchPage.playerCheckbox("bravo", 3).click();
		await matchPage.playerCheckbox("bravo", 4).click();
		await matchPage.saveActiveRoster("bravo");

		await expect(matchPage.editActiveRosterButton("bravo")).toBeVisible();
	});

	test("only asks for weapons of the maps played", async ({
		page,
		factories,
	}) => {
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

		const ROSTER_WITH_VIEWER = [0, 1, 2, 4];
		const ROSTER_WITHOUT_VIEWER = [0, 1, 2, 3];
		const viewerUserId = teamWithSub.memberUserIds[4];

		await impersonate(page, viewerUserId);

		const matchPage = new TournamentMatchPage(page);
		await matchPage.goto({ tournamentId: tournament.id, matchId: match.id });

		// Map 1: subbed in, reports their weapon like any other player
		await matchPage.openTab("rosters");
		await matchPage.setActiveRoster("bravo", ROSTER_WITH_VIEWER);

		await matchPage.openTab("action");
		await matchPage.reportWeapon("Splattershot");
		await expect(matchPage.locators.undoWeaponButton).toBeVisible();
		await matchPage.reportResult({
			mapsToReport: 1,
			winner: 1,
			setEnds: false,
		});

		// Map 2: subbed out, so there is no weapon of theirs to report
		await matchPage.openTab("rosters");
		await matchPage.setActiveRoster("bravo", ROSTER_WITHOUT_VIEWER);

		await matchPage.openTab("action");
		await matchPage.expandWeaponReporter();
		await isNotVisible(matchPage.weaponPrompt(2));

		await matchPage.reportResult({
			mapsToReport: 1,
			winner: 2,
			setEnds: false,
		});

		// Map 3: subbed back in, asked for the map they are about to play
		await matchPage.openTab("rosters");
		await matchPage.setActiveRoster("bravo", ROSTER_WITH_VIEWER);

		await matchPage.openTab("action");
		await matchPage.expandWeaponReporter();
		await expect(matchPage.weaponPrompt(3)).toBeVisible();

		// Undoing map 2 puts it back up for grabs, now with them on the roster
		await matchPage.undoLastReport();
		await matchPage.expandWeaponReporter();
		await expect(matchPage.weaponPrompt(2)).toBeVisible();
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

		await expect(brackets.matchTimer(matchId)).toBeVisible();

		// past the 26min limit of a Bo3
		await page.clock.fastForward("30:00");
		await page.reload();

		match = await brackets.openMatch(matchId);

		await match.openTab("admin");
		await match.endSetWithRandomWinner();

		await expect(match.locators.finalBanner).toBeVisible();
	});

	test("shows a result reported while the app was suspended", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		test.slow();
		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Backgrounded Cup",
			friendId: NZAP_TEST_ID,
		});

		// the event stream a suspended app comes back to: still connected as far as
		// the page knows, but no longer subscribed to anything, so the broadcast of
		// the result below never reaches it
		await page.route(/\/sse\/[^/]+\/topics$/, (route) => route.abort());

		await impersonate(page, NZAP_TEST_ID);
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		await expect(brackets.matchScores(matchId)).toHaveText(["0", "0"]);

		const organizer = await openSecondUser(browser, workerBaseURL);
		try {
			const matchPage = new TournamentMatchPage(organizer.page);
			await matchPage.goto({ tournamentId: tournament.id, matchId });
			await matchPage.openTab("action");
			await matchPage.reportResult({ mapsToReport: 1, setEnds: false });

			// the page missed it, the same way a phone with its screen off does
			await expect(brackets.matchScores(matchId)).toHaveText(["0", "0"]);

			await deviceAsleep(page, "10:00");

			await expect(brackets.matchScores(matchId)).toHaveText(["1", "0"], {
				timeout: 15_000,
			});
		} finally {
			await organizer.close();
		}
	});
});

/**
 * The device sleeping for the given time: the page's clock jumps forward without it
 * having run, the way a phone suspending a PWA leaves it — no transition to hidden
 * on the way out, and no announcement of the return either.
 */
async function deviceAsleep(page: Page, duration: string) {
	await page.clock.install();
	await page.clock.fastForward(duration);
	await page.clock.resume();
}
