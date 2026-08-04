import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	SWISS_EARLY_ADVANCE_TO_TOP_CUT,
	SWISS_TO_TOP_CUT,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";

test.describe("Tournament bracket swiss", () => {
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

	test("swiss tournament with early advance replaying & giving a bye to a lone team", async ({
		page,
		factories,
	}) => {
		test.slow();

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SWISS_EARLY_ADVANCE_TO_TOP_CUT,
			mapPoolMaps: TO_MAP_POOL,
		});
		await createTeams(factories, tournament.id, teamSeeds(3));

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		// round 1: Team 1 vs. Team 2, Team 3 gets a bye
		const roundOneMatch = await brackets.openMatch(1);
		await roundOneMatch.openTab("action");
		await roundOneMatch.reportResultForTeam({
			teamName: "Team 1",
			mapsToReport: 2,
		});
		await roundOneMatch.backToBracket();

		// round 2: Team 1 vs. Team 3, Team 2 gets a bye
		await brackets.startRound();
		const roundTwoMatch = await brackets.openMatch(3);
		await roundTwoMatch.openTab("action");
		// Team 3 reaches the advance threshold and is done with the bracket
		await roundTwoMatch.reportResultForTeam({
			teamName: "Team 3",
			mapsToReport: 2,
		});
		await roundTwoMatch.backToBracket();

		// round 3: Team 1 & Team 2 are the only ones left so they replay their round 1 match
		await brackets.startRound();
		await expect(brackets.match(5)).toContainText("Team 1");
		await expect(brackets.match(5)).toContainText("Team 2");
		const roundThreeMatch = await brackets.openMatch(5);
		await roundThreeMatch.openTab("action");
		await roundThreeMatch.reportResultForTeam({
			teamName: "Team 1",
			mapsToReport: 2,
		});
		await roundThreeMatch.backToBracket();

		// round 4: Team 2 is alone in the round so they get a bye
		await brackets.startRound();
		await expect(brackets.locators.byeTeam).toHaveText([
			"BYE: Team 3",
			"BYE: Team 2",
			"BYE: Team 2",
		]);

		// every team has advanced so the last round is never played
		await isNotVisible(brackets.roundLabel(5));
		await isNotVisible(brackets.locators.startRoundButton);

		await brackets.bracketTab("Top Cut").click();
		await brackets.finalize();
		await expect(brackets.match(8)).toBeVisible();
	});
});
