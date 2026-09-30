import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	ROUND_ROBIN,
	RR_TO_SE_WITH_UNDERGROUND,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { MatchProfilePage } from "./pages/settings/match-profile-page";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentPage } from "./pages/tournament/tournament-page";

test.describe("Tournament bracket round robin", () => {
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
		await match.editResultPlayerCheckbox("alpha", 3).click();
		await match.editResultPlayerCheckbox("alpha", 4).click();
		// RR collects KO, which shows the edit went through
		await match.locators.koCheckbox.check();
		await match.saveResult(0);

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

		// the two passes play rounds 1 (matches 1 & 2) and 2 (matches 3 & 4), so the
		// winner of a match whose participants already played on gets changed
		await factories.TournamentFactory.startBracket(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const match = await brackets.openMatch(2);
		await match.openTab("admin");
		await match.reopen();
		// switching tabs is a `defaultShouldRevalidate: false` navigation that would
		// abort the in-flight post-reopen revalidation, leaving the match "over"
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

		// playing R1 (matches 1 and 2) unlocks R2
		await factories.TournamentFactory.startBracket(tournament.id);
		await factories.TournamentFactory.playMatches(tournament.id);

		await impersonate(page);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		// match 3 is R2: start it without completing it
		let match = await brackets.openMatch(3);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });
		await match.backToBracket();

		// reopening the R1 match simulates a score misreport correction
		match = await brackets.openMatch(1);
		await match.openTab("admin");
		await match.reopen();
		await match.backToBracket();

		// the R2 match already in progress used to become locked and unplayable
		match = await brackets.openMatch(3);
		await expect(match.score([1, 0])).toBeVisible();
		await match.openTab("action");
		await expect(match.winnerRadio(1)).toBeVisible();
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
});
