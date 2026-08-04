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

test.describe("Tournament bracket pick/ban", () => {
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
