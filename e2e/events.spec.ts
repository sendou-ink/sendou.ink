import { addHours, subWeeks } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { EventsPage } from "./pages/calendar/events-page";

const JOINED_TOURNAMENT_NAME = "Joined Tournament";
const ORGANIZED_TOURNAMENT_NAME = "Organized Tournament";
const WEDNESDAY = 2;
const DAY_SECONDS = 24 * 60 * 60;

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

test.describe("My schedule", () => {
	test("saves a week, edits it and submits an empty week", async ({ page }) => {
		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		await expect(events.weekNotFilledMarker("current")).toBeVisible();

		await events.dayEditButton(WEDNESDAY).click();
		const popover = events.locators.dayEditorPopover;
		await popover.getByLabel("Start").fill("18:00");
		await popover.getByLabel("End").fill("22:00");
		await popover.getByLabel("Note").fill("Leaving early");
		await page.keyboard.press("Escape");

		await expect(events.locators.availabilityBars).toHaveCount(1);

		// leaving the page with the unsaved week warns first
		await page
			.getByRole("link", { name: "Find an event to join on the calendar!" })
			.click();
		await page.getByText("Unsaved changes").waitFor();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page).toHaveURL(/\/events/);

		await events.locators.saveWeekButton.click();
		await expect(page.getByText("Availability saved")).toBeAttached();

		await events.goto();
		await expect(events.locators.availabilityBars).toHaveCount(1);
		await isNotVisible(events.weekNotFilledMarker("current"));
		await expect(events.weekNotFilledMarker("next")).toBeVisible();

		await events.dayEditButton(WEDNESDAY).click();
		await expect(popover.getByLabel("Note")).toHaveValue("Leaving early");
		// deleting the only range commits instantly: the popover closes and the
		// bar disappears without waiting for a popover close + save
		await popover.getByRole("button", { name: "Delete" }).click();
		await isNotVisible(events.locators.dayEditorPopover);
		await isNotVisible(events.locators.availabilityBars);
		await events.locators.saveWeekButton.click();
		await expect(page.getByText("Availability saved")).toBeAttached();

		// an empty submitted week is "unavailable all week", not missing
		await events.goto();
		await isNotVisible(events.locators.availabilityBars);
		await isNotVisible(events.weekNotFilledMarker("current"));
	});

	test("shows a commitment as a locked block on the editor", async ({
		page,
		factories,
	}) => {
		const currentWeek = Availability.weekRange(new Date(), MACHINE_TIMEZONE);
		const wednesday = Availability.dateInTimezone(
			currentWeek.startsAt + WEDNESDAY * DAY_SECONDS + DAY_SECONDS / 2,
			MACHINE_TIMEZONE,
		);
		const team = await factories.TeamFactory.create({
			memberUserIds: [ADMIN_ID],
		});
		await factories.TeamEventFactory.create({
			teamId: team.id,
			authorId: ADMIN_ID,
			name: "VoD review",
			startsAt: Availability.localToTimestamp({
				date: wednesday,
				time: "20:00",
				timezone: MACHINE_TIMEZONE,
			}),
			endsAt: Availability.localToTimestamp({
				date: wednesday,
				time: "21:30",
				timezone: MACHINE_TIMEZONE,
			}),
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		await expect(events.locators.commitments.first()).toBeVisible();
		await expect(events.locators.commitments.first()).toHaveText("VoD review");
	});

	test("paints a range reaching past the hours the tracks show", async ({
		page,
	}) => {
		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		// the tracks end at 2 AM until they are expanded; the paint runs past
		// their right edge and the window widens to fit what it produced
		await events.paintAvailability(WEDNESDAY, 0.5, 1.25);

		await expect(events.locators.availabilityBars).toHaveAttribute(
			"title",
			"8:00 PM – 5:00 AM",
		);
	});

	test("opens the day editor on the click following a drag", async ({
		page,
	}) => {
		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		await events.paintAvailability(WEDNESDAY, 0.3, 0.5);
		// the drag ends with a click of its own, which must not open the popover
		// without swallowing the click that comes after it either
		await events.dragAvailabilityBar(events.locators.availabilityBars, 60);
		await isNotVisible(events.locators.dayEditorPopover);

		await events.locators.availabilityBars.click();
		await expect(events.locators.dayEditorPopover).toBeVisible();
	});

	test("copies last week's ranges into the current week", async ({
		page,
		factories,
	}) => {
		const lastWeekRange = Availability.weekRange(
			subWeeks(new Date(), 1),
			MACHINE_TIMEZONE,
		);
		const lastWednesday = Availability.dateInTimezone(
			lastWeekRange.startsAt + WEDNESDAY * DAY_SECONDS + DAY_SECONDS / 2,
			MACHINE_TIMEZONE,
		);
		await factories.AvailabilityWeekFactory.create({
			userId: ADMIN_ID,
			weekStartsAt: lastWeekRange.startsAt,
			timezone: MACHINE_TIMEZONE,
			slots: [
				{
					startsAt: Availability.localToTimestamp({
						date: lastWednesday,
						time: "19:00",
						timezone: MACHINE_TIMEZONE,
					}),
					endsAt: Availability.localToTimestamp({
						date: lastWednesday,
						time: "21:00",
						timezone: MACHINE_TIMEZONE,
					}),
				},
			],
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		await isNotVisible(events.locators.availabilityBars);
		await events.locators.copyLastWeekButton.click();
		await expect(events.locators.availabilityBars).toHaveCount(1);

		await events.locators.saveWeekButton.click();
		await expect(page.getByText("Availability saved")).toBeAttached();
	});
});
