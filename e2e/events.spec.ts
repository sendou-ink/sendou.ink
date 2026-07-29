import { addHours } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, test } from "./helpers/playwright";
import { EventsPage } from "./pages/calendar/events-page";

const JOINED_TOURNAMENT_NAME = "Joined Tournament";
const ORGANIZED_TOURNAMENT_NAME = "Organized Tournament";

test.describe("Events", () => {
	test("filters between tabs and navigates to an event", async ({
		page,
		factories,
	}) => {
		const startsAt = dateToDatabaseTimestamp(addHours(new Date(), 2));

		const joinedTournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: JOINED_TOURNAMENT_NAME,
			startTimes: [startsAt],
		});
		await factories.TournamentTeamFactory.create({
			tournamentId: joinedTournament.id,
			memberUserIds: [NZAP_TEST_ID],
		});
		await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			name: ORGANIZED_TOURNAMENT_NAME,
			startTimes: [startsAt],
		});
		await factories.ScrimPostFactory.create({
			startsAt,
			users: [{ userId: NZAP_TEST_ID, isOwner: 1 }],
		});

		await impersonate(page, NZAP_TEST_ID);

		const events = new EventsPage(page);
		await events.goto();

		await expect(events.locators.title).toBeVisible();

		// the first non-empty category is shown by default
		await expect(events.eventLink(JOINED_TOURNAMENT_NAME)).toBeVisible();

		await events.openView("scrims");
		await expect(events.eventLink("Looking for scrim")).toBeVisible();

		await events.openView("saved");
		await expect(events.locators.emptyCategoryText).toBeVisible();

		await events.openView("hosting");
		const hostedEvent = events.eventLink(ORGANIZED_TOURNAMENT_NAME);
		await expect(hostedEvent).toBeVisible();

		await hostedEvent.click();
		await expect(page).not.toHaveURL(/\/events/);
	});
});
