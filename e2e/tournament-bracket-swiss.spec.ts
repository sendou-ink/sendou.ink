import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
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
});
