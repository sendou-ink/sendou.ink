import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, test } from "./helpers/playwright";
import {
	createTeams,
	ROUND_ROBIN,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

/** Counterpick options are grouped by the modes still available, of the four the
 * tournament's map pool holds. Plain COUNTERPICK bars the picker from the mode
 * they last won on, MODE_REPEAT_OK leaves every mode open. BAN_2 has no
 * counterpicks at all. */
const PICK_BAN_VARIANTS = [
	{ pickBan: "COUNTERPICK", modeGroupsAfterWinning: 3 },
	{ pickBan: "COUNTERPICK_MODE_REPEAT_OK", modeGroupsAfterWinning: 4 },
	{ pickBan: "BAN_2", modeGroupsAfterWinning: null },
] as const;

test.describe("Tournament bracket pick/ban", () => {
	for (const { pickBan, modeGroupsAfterWinning } of PICK_BAN_VARIANTS) {
		const isCounterpick = modeGroupsAfterWinning !== null;

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
			await mapListDialog.togglePickBan();
			await mapListDialog.setPickBan(pickBan);
			await mapListDialog.confirm();

			const match = new TournamentMatchPage(page);

			if (!isCounterpick) {
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

			if (isCounterpick) {
				await match.pickBan();
			}

			await impersonate(page, teamTwoCaptainId);
			await match.goto({ tournamentId: tournament.id, matchId });

			await match.openTab("action");
			await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });

			if (isCounterpick) {
				// team two won the first map, so its own counterpick after losing the
				// second one is the one the mode repeat rule bites on
				await expect(match.locators.pickBanModeGroups).toHaveCount(
					modeGroupsAfterWinning,
				);
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

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const mapListDialog = await brackets.openFinalizeDialog();
		await mapListDialog.setPickBan("CUSTOM");
		await expect(mapListDialog.locators.beforeSetText).toBeVisible();
		await mapListDialog.confirmWithCustomFlow(customFlow);

		const match = new TournamentMatchPage(page);

		// PreSet: higher seed bans 2 maps
		await impersonate(page, higherSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// PreSet: lower seed bans 2 maps
		await impersonate(page, lowerSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// the roll auto-executes after the last ban
		await expect(match.locators.stageBanner).toBeVisible();
		await match.openTab("action");

		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await expect(match.score([1, 0])).toBeVisible();

		// PostGame: the winner (alpha, whose captain is still impersonated) bans 2 maps
		await expect(match.locators.banAMapText).toBeVisible();
		await match.pickBan();

		await expect(match.locators.lastBanText).toBeVisible();
		await match.pickBan();

		// PostGame: the loser (bravo) picks a map
		await impersonate(page, higherSeedCaptainId);
		await match.goto({ tournamentId: tournament.id, matchId });
		await match.openTab("action");

		await expect(match.locators.pickAMapText).toBeVisible();
		await match.pickBan();

		// undoing game 1 also deletes the postGame pick/ban events
		await expect(match.locators.stageBanner).toBeVisible();
		await match.undoLastReport();

		await expect(match.score([0, 0])).toBeVisible();
		await expect(match.locators.stageBanner).toBeVisible();

		// the postGame cycle restarts
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, winner: 1, setEnds: false });
		await expect(match.score([1, 0])).toBeVisible();

		await expect(match.locators.banAMapText).toBeVisible();
	});
});
