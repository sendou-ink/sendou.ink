import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, test } from "./helpers/playwright";
import {
	createTeams,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { TopRightButtons } from "./pages/layout/top-right-buttons";
import { TournamentAdminBoardPage } from "./pages/tournament/tournament-admin-board-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";
import { TournamentStationsDisplayPage } from "./pages/tournament/tournament-stations-display-page";

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

	test("notifies the teams of a match put on a station", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
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
		const [first] = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		await impersonate(page, NZAP_TEST_ID);
		const board = new TournamentAdminBoardPage(page);
		await board.goto(tournament.id);
		await board.moveMatch(first.id, station.id);

		// the top seed plays the first semifinal
		await impersonate(page, teams[0].memberUserIds[0]);
		const brackets = new TournamentBracketsPage(page);
		const notifications = new NotificationPopover(page);
		// sent once the match has stayed on the station for a moment
		await expect(async () => {
			await brackets.goto(tournament.id);
			await notifications.open();
			await expect(
				notifications.notification("Station 1 (North corner):"),
			).toBeVisible({ timeout: 1_000 });
		}).toPass();
	});
});

test.describe("LAN tournament map preview", () => {
	test("steps through a match's maps in its banner, before and while it's played", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: tournament.eventId,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		// every round is SZ on stages 1, 2 and 3
		const [semifinal, , final] = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		const match = new TournamentMatchPage(page);
		const { locators } = match;

		// teams not known yet
		await match.goto({ tournamentId: tournament.id, matchId: final.id });
		await expect(locators.stageBanner).toHaveCount(0);
		await expect(locators.previousMapButton).toHaveCount(0);
		await locators.nextMapButton.click();
		await expect(page.getByTestId("banner-map-SZ-1")).toBeVisible();
		await expect(locators.mapPreviewLabel).toHaveText("Game 1 · upcoming");
		await expect(locators.previewedMode).toHaveCount(1);
		await locators.nextMapButton.click();
		await locators.nextMapButton.click();
		await expect(page.getByTestId("banner-map-SZ-3")).toBeVisible();
		await expect(locators.nextMapButton).toHaveCount(0);
		for (let i = 0; i < 3; i++) await locators.previousMapButton.click();
		await expect(locators.stageBanner).toHaveCount(0);
		await expect(locators.previewedMode).toHaveCount(0);

		// being played: the current map, the next ones a step away
		await match.goto({ tournamentId: tournament.id, matchId: semifinal.id });
		await expect(page.getByTestId("banner-map-SZ-1")).toBeVisible();
		await expect(locators.mapPreviewLabel).toHaveCount(0);
		await expect(locators.previousMapButton).toHaveCount(0);
		await locators.nextMapButton.click();
		await expect(page.getByTestId("banner-map-SZ-2")).toBeVisible();
		await expect(locators.mapPreviewLabel).toHaveText("Game 2 · upcoming");
		await locators.previousMapButton.click();
		await expect(page.getByTestId("banner-map-SZ-1")).toBeVisible();
		await expect(locators.mapPreviewLabel).toHaveCount(0);
	});
});

test.describe("LAN tournament station display screen", () => {
	test("shows a logged out viewer the stations' matches, updating live when they move", async ({
		page,
		browser,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: tournament.eventId,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		const station1 = await factories.TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 1",
			locationNote: "North corner",
			autoAssign: false,
		});
		const station2 = await factories.TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 2",
		});
		const [first, second, final] =
			await factories.TournamentFactory.startBracket(tournament.id);
		await factories.TournamentMatchStationFactory.create({
			matchId: first.id,
			stationId: station1.id,
		});
		await factories.TournamentMatchStationFactory.create({
			matchId: final.id,
			stationId: station1.id,
		});

		const displayContext = await browser.newContext();
		const display = new TournamentStationsDisplayPage(
			await displayContext.newPage(),
		);
		await display.goto(tournament.id);

		await expect(display.station(station1.id)).toContainText("North corner");
		await expect(display.now(station1.id)).toContainText("Team 1");
		await expect(display.now(station1.id)).toContainText("Team 4");
		// the final's teams aren't known yet
		await expect(display.next(station1.id)).toContainText("Winner of");
		await expect(display.next(station1.id)).toContainText("Starts in ~");
		await expect(display.locators.lastUpdated).toContainText("Last updated");
		await expect(display.now(station2.id)).toContainText("Free");
		await expect(display.locators.waiting).toContainText("Team 2");

		await impersonate(page, NZAP_TEST_ID);
		const board = new TournamentAdminBoardPage(page);
		await board.goto(tournament.id);
		await board.moveMatch(second.id, station2.id);

		await expect(display.now(station2.id)).toContainText("Team 2");
		await expect(display.locators.waiting).toHaveCount(0);

		await displayContext.close();
	});

	test("tells a logged out viewer a tournament without stations has none", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: tournament.eventId,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		await factories.TournamentFactory.startBracket(tournament.id);

		const display = new TournamentStationsDisplayPage(page);
		await display.goto(tournament.id);

		await expect(display.locators.noStationsNotice).toBeVisible();
		await expect(display.locators.waiting).toHaveCount(0);
	});
});
