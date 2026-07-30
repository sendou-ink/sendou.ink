import { subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, test } from "./helpers/playwright";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentSeedsPage } from "./pages/tournament/tournament-seeds-page";

const TEAMS_PER_DIVISION = 6;
const ROSTER_SIZE = 4;

test.describe("Tournament A/B divisions", () => {
	test("assigns 6A/6B, starts bracket, renders 36 matches across 6 rounds and two standings tables", async ({
		page,
		factories,
	}) => {
		test.slow();

		const teamCount = TEAMS_PER_DIVISION * 2;
		const players = await factories.UserFactory.createMany(
			teamCount * ROSTER_SIZE,
		);
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 30))],
			mapPickingStyle: "AUTO_ALL",
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups stage",
					requiresCheckIn: false,
					settings: { hasAbDivisions: true, teamsPerGroup: teamCount },
				},
			],
		});
		for (let i = 0; i < teamCount; i++) {
			await factories.TournamentTeamFactory.create(
				{
					tournamentId: tournament.id,
					memberUserIds: players
						.slice(i * ROSTER_SIZE, (i + 1) * ROSTER_SIZE)
						.map((player) => player.id),
				},
				{ isCheckedIn: true },
			);
		}

		await impersonate(page, NZAP_TEST_ID);

		const seeds = new TournamentSeedsPage(page);
		await seeds.goto(tournament.id);

		await seeds.openAbDivisionsDialog();

		await expect(seeds.locators.abDivisionRadioGroups).toHaveCount(teamCount);

		for (let i = 0; i < TEAMS_PER_DIVISION; i++) {
			await seeds.assignAbDivision(i, "A");
		}
		for (let i = TEAMS_PER_DIVISION; i < teamCount; i++) {
			await seeds.assignAbDivision(i, "B");
		}

		await seeds.saveAbDivisions();

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		await expect(brackets.locators.bracketsViewer).toBeVisible();

		await expect(brackets.locators.matches).toHaveCount(
			TEAMS_PER_DIVISION * TEAMS_PER_DIVISION,
		);

		for (
			let roundNumber = 1;
			roundNumber <= TEAMS_PER_DIVISION;
			roundNumber++
		) {
			await expect(brackets.roundLabel(roundNumber).first()).toBeVisible();
		}

		await expect(brackets.locators.rrStandingsTables).toHaveCount(2);
	});
});
