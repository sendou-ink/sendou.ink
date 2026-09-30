import { addDays, addHours, subDays } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { tournamentMatchesPage } from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import {
	createTeams,
	ROUND_ROBIN,
	startedTournamentTimes,
	TO_MAP_POOL,
} from "./helpers/tournament";
import { TournamentDivisionsPage } from "./pages/tournament/tournament-divisions-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

/** A two team league whose only round has been playable since yesterday, so its set can be scheduled and played. */
async function createLeagueSet(
	factories: Parameters<Parameters<typeof test>[2]>[0]["factories"],
) {
	const tournament = await factories.TournamentFactory.create(
		{
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: ROUND_ROBIN,
			mapPoolMaps: TO_MAP_POOL,
		},
		{ isLeague: true },
	);
	const [nzapTeam, opponentTeam] = await createTeams(factories, tournament.id, [
		{ members: [NZAP_TEST_ID] },
		{},
	]);
	const [match] = await factories.TournamentFactory.startBracket(
		tournament.id,
		{
			isPlayableAt: () => dateToDatabaseTimestamp(subDays(new Date(), 1)),
		},
	);

	return { tournament, nzapTeam, opponentTeam, matchId: match.id };
}

test.describe("Tournament league", () => {
	test("teams agree on a time, decline a reschedule, the organizer overrides it and the set gets played", async ({
		page,
		factories,
	}) => {
		test.slow();

		const { tournament, opponentTeam, matchId } =
			await createLeagueSet(factories);
		const matchPage = new TournamentMatchPage(page);
		const nzapTime = addHours(addDays(new Date(), 2), 1);
		const opponentTime = addHours(addDays(new Date(), 3), 1);

		// N-ZAP proposes a time; the set has no time yet so the schedule tab opens by itself
		await impersonate(page, NZAP_TEST_ID);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await expect(matchPage.locators.unscheduledBanner).toBeVisible();
		await isNotVisible(matchPage.locators.stageBanner);
		await matchPage.proposeTime(nzapTime);
		await expect(
			matchPage.locators.ownCandidates.getByTestId("candidate-time"),
		).toHaveCount(1);
		// only the other team can pick a candidate
		await isNotVisible(matchPage.locators.pickCandidateButtons);

		// the opponent answers with a time of their own, then picks N-ZAP's after all
		await impersonate(page, opponentTeam.ownerUserId);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await expect(
			matchPage.locators.opponentCandidates.getByTestId("candidate-time"),
		).toHaveCount(1);
		await matchPage.proposeTime(opponentTime);
		await expect(matchPage.locators.candidateTimes).toHaveCount(2);
		await matchPage.pickCandidate();
		await expect(matchPage.locators.agreedTime).toBeVisible();
		await expect(matchPage.locators.candidateTimes).toHaveCount(0);
		// agreed and playable: the stage banner is back and the set can be reported
		await expect(matchPage.locators.stageBanner).toBeVisible();

		// N-ZAP asks for another time as a favor, the opponent keeps the agreed one
		await impersonate(page, NZAP_TEST_ID);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await matchPage.openTab("schedule");
		await matchPage.proposeTime(addHours(nzapTime, 2));
		await expect(matchPage.locators.candidateTimes).toHaveCount(1);

		await impersonate(page, opponentTeam.ownerUserId);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await matchPage.openTab("schedule");
		await expect(matchPage.locators.rejectRescheduleButton).toBeVisible();
		await matchPage.locators.rejectRescheduleButton.click();
		await expect(matchPage.locators.candidateTimes).toHaveCount(0);
		await expect(matchPage.locators.agreedTime).toBeVisible();

		// the organizer's time is final and closes the board
		await impersonate(page, ADMIN_ID);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await matchPage.openTab("admin");
		await matchPage.organizerSetTime(addHours(opponentTime, 3));
		await matchPage.openTab("schedule");
		await expect(matchPage.locators.setByOrganizerText).toBeVisible();
		await isNotVisible(matchPage.locators.proposeTimesButton);

		// the scheduled set shows up on the matches page, and gets played like any other
		await navigate({ page, url: tournamentMatchesPage(tournament.id) });
		await expect(page.getByTestId("scheduled-sets")).toBeVisible();
		await expect(page.getByTestId(`set-row-${matchId}`)).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await matchPage.goto({ tournamentId: tournament.id, matchId });
		await matchPage.openTab("action");
		await matchPage.reportResult({ mapsToReport: 2 });
		await expect(matchPage.locators.finalBanner).toBeVisible();

		await navigate({ page, url: tournamentMatchesPage(tournament.id) });
		await page.getByTestId("matches-tab-past").click();
		await expect(
			page.getByTestId("past-sets").getByTestId(`set-row-${matchId}`),
		).toBeVisible();
	});

	test("a set can't be played before the teams agree on a time or the round is playable", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create(
			{
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression: ROUND_ROBIN,
				mapPoolMaps: TO_MAP_POOL,
			},
			{ isLeague: true },
		);
		await createTeams(factories, tournament.id, [
			{ members: [NZAP_TEST_ID] },
			{},
		]);
		// playable in a week: the board opens a day before that
		const [match] = await factories.TournamentFactory.startBracket(
			tournament.id,
			{
				isPlayableAt: () => dateToDatabaseTimestamp(addDays(new Date(), 7)),
			},
		);

		await impersonate(page, NZAP_TEST_ID);
		const matchPage = new TournamentMatchPage(page);
		await matchPage.goto({ tournamentId: tournament.id, matchId: match.id });

		await expect(page.getByTestId("league-not-open-banner")).toBeVisible();
		await isNotVisible(matchPage.locators.scheduleTab);
		await isNotVisible(matchPage.locators.stageBanner);
	});

	test("a league of several divisions lists them on the divisions page", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create(
			{
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression: [
					{ ...ROUND_ROBIN[0], name: "Division 1" },
					{ ...ROUND_ROBIN[0], name: "Division 2" },
				],
				mapPoolMaps: TO_MAP_POOL,
			},
			{ isLeague: true },
		);
		await createTeams(factories, tournament.id, [{}, {}, {}, {}]);

		await impersonate(page, ADMIN_ID);
		const divisions = new TournamentDivisionsPage(page);
		await divisions.goto(tournament.id);

		await expect(divisions.locators.divisionLinks).toHaveCount(2);
	});
});
