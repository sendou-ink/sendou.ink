import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, test } from "./helpers/playwright";
import {
	createTeams,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { TopRightButtons } from "./pages/layout/top-right-buttons";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

test.describe("LAN tournament stations for players", () => {
	test("shows the match's station and estimated start, without deadlines, on the bracket, match page and header status", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			// running, so the header status shows the match
			startTimes: startedTournamentTimes(),
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: tournament.eventId,
		});
		const teams = await createTeams(factories, tournament.id, teamSeeds(4));
		const station = await factories.TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 1",
			locationNote: "North corner",
			autoAssign: false,
		});
		await factories.TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 2",
		});
		const [first, second, final] =
			await factories.TournamentFactory.startBracket(tournament.id);
		for (const match of [first, second]) {
			await factories.TournamentMatchStationFactory.create({
				matchId: match.id,
				stationId: station.id,
			});
		}

		// Team 2 plays one of the semifinals, both queued on Station 1
		await impersonate(page, teams[1].memberUserIds[0]);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await expect(brackets.matchStation(first.id)).toHaveText("1");
		await expect(brackets.matchStation(second.id)).toHaveText("1");
		await expect(brackets.matchStation(final.id)).toHaveCount(0);
		// LAN matches have no deadline
		await expect(page.getByTestId("bracket-match-timer")).toHaveCount(0);

		const match = new TournamentMatchPage(page);
		await match.goto({ tournamentId: tournament.id, matchId: second.id });
		await expect(match.locators.station).toHaveText("1");
		await expect(match.locators.matchTimer).toHaveCount(0);
		// played after the other semifinal on the same station
		await expect(match.locators.eta).toContainText("min");
		await match.locators.station.click();
		await expect(page.getByText("North corner")).toBeVisible();

		// first in the station's queue: played now, no countdown
		await match.goto({ tournamentId: tournament.id, matchId: first.id });
		await expect(match.locators.station).toHaveText("1");
		await expect(match.locators.eta).toHaveCount(0);

		const topRight = new TopRightButtons(page);
		await topRight.globalStatus("In match").click();
		await expect(topRight.globalStatusStation).toContainText("Station 1");
		await expect(topRight.globalStatusStation).toContainText("North corner");
	});
});
