import { subHours, subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, test } from "./helpers/playwright";
import { CalendarPage } from "./pages/calendar/calendar-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";

const TEAM_COUNT = 8;
const ROSTER_SIZE = 4;
/** "A" tier, seeded into the series' history by the played tournament. */
const HISTORY_TIER = 5;

test.describe("Tournament tiers", () => {
	test("shows tentative tier before bracket starts and confirmed tier after", async ({
		page,
		factories,
	}) => {
		test.slow();

		const players = await factories.UserFactory.createMany(
			TEAM_COUNT * ROSTER_SIZE,
		);
		const rosters = Array.from({ length: TEAM_COUNT }, (_, i) =>
			players
				.slice(i * ROSTER_SIZE, (i + 1) * ROSTER_SIZE)
				.map((player) => player.id),
		);

		const org = await factories.TournamentOrganizationFactory.create(
			{ ownerId: NZAP_TEST_ID },
			{
				series: [{ name: "PICNIC", description: null, showLeaderboard: false }],
			},
		);

		// a finalized earlier edition: its tier seeds the series' tier history and
		// playing it out gives every player the seeding skill the confirmed tier
		// of the next edition is calculated from
		await factories.TournamentFactory.createPlayed(
			{
				name: "PICNIC 1",
				authorId: NZAP_TEST_ID,
				organizationId: org.id,
				startTimes: [dateToDatabaseTimestamp(subHours(new Date(), 5))],
				tags: null,
				isRanked: false,
			},
			{ teamRosters: rosters, tier: HISTORY_TIER, playedOut: "all" },
		);

		const tournament = await factories.TournamentFactory.create({
			name: "PICNIC 2",
			authorId: NZAP_TEST_ID,
			organizationId: org.id,
			startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 30))],
			tags: null,
			mapPickingStyle: "AUTO_SZ",
		});
		for (const roster of rosters) {
			await factories.TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: roster },
				{ isCheckedIn: true },
			);
		}

		const calendar = new CalendarPage(page);
		await calendar.goto();

		await expect(calendar.tentativeTierPill("PICNIC 2")).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await brackets.finalize();

		await calendar.goto();

		await expect(calendar.confirmedTierPill("PICNIC 2")).toBeVisible();
	});
});
