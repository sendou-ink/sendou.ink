import { addHours, subWeeks } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { weekDates, weekRange } from "./helpers/availability";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { createNamedUsers } from "./helpers/sidebar";
import { EventsPage } from "./pages/calendar/events-page";
import { FriendsPage } from "./pages/friends/friends-page";
import { TeamSchedulePage } from "./pages/team/team-schedule-page";

const JOINED_TOURNAMENT_NAME = "Joined Tournament";
const ORGANIZED_TOURNAMENT_NAME = "Organized Tournament";
const WEDNESDAY = 2;
const DAY_SECONDS = 24 * 60 * 60;
const ALL_FRIENDS = "All friends";

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

	test("crosses over to the team schedule and back, keeping the week", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: "Team Olive",
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();

		// the week the editor is showing carries over to the team schedule
		await events.locators.nextWeekToggle.click();
		await events.locators.teamScheduleLink.click();
		await expect(page).toHaveURL(
			new RegExp(`/t/${customUrl}/schedule\\?week=next`),
		);

		const schedule = new TeamSchedulePage(page);
		await expect(schedule.locators.heatmap).toBeVisible();

		// the week the schedule is showing carries over to the editor
		await schedule.locators.editAvailabilityLink.click();
		await expect(page).toHaveURL(/\/events\?week=next/);
		await expect(events.weekNotFilledMarker("next")).toBeVisible();
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

test.describe("Schedule visibility", () => {
	test("stops friends seeing the schedule, then opens it up to a team joined later", async ({
		page,
		factories,
	}) => {
		const [teammate] = await createNamedUsers(factories, ["Teammate"]);
		// N-ZAP is a friend and deliberately not a teammate, so only the friends toggle reaches them
		await factories.FriendshipFactory.create({
			userOneId: ADMIN_ID,
			userTwoId: NZAP_TEST_ID,
		});
		await factories.AvailabilityWeekFactory.create({
			userId: ADMIN_ID,
			weekStartsAt: weekRange().startsAt,
			timezone: MACHINE_TIMEZONE,
			slots: [daySlot(WEDNESDAY, "18:00", "22:00")],
		});

		const friends = new FriendsPage(page);
		await impersonate(page, NZAP_TEST_ID);
		await setTimezoneCookie(page);
		await friends.goto();

		await expect(friends.scheduleButton(ADMIN_ID)).toBeVisible();

		const events = new EventsPage(page);
		await impersonate(page, ADMIN_ID);
		await events.goto();

		// nothing restricted yet, so the editor says nothing about who is left out
		await isNotVisible(events.locators.notSharedWith);

		await events.setScheduleVisibility({ uncheck: [ALL_FRIENDS] });

		await expect(events.locators.visibilityButton).toHaveText("Limited");
		await expect(events.locators.notSharedWith).toHaveText(
			"· Not shared with friends",
		);

		await impersonate(page, NZAP_TEST_ID);
		await friends.goto();

		await isNotVisible(friends.scheduleButton(ADMIN_ID));

		// joined after the visibility was saved, so it starts outside the allow-list
		const team = await factories.TeamFactory.create({
			name: "Team Olive",
			memberUserIds: [teammate.id, ADMIN_ID],
		});

		const schedule = new TeamSchedulePage(page);
		await impersonate(page, teammate.id);
		await setTimezoneCookie(page);
		await schedule.goto(team.customUrl);
		await schedule.locators.gridViewTab.click();

		await isNotVisible(schedule.cellRange(ADMIN_ID, WEDNESDAY));

		await impersonate(page, ADMIN_ID);
		await events.goto();

		// the team joined after the save is outside the allow-list, and named as such
		await expect(events.locators.notSharedWith).toHaveText(
			"· Not shared with friends and Team Olive",
		);

		await events.setScheduleVisibility({ check: ["Team Olive"] });

		await expect(events.locators.notSharedWith).toHaveText(
			"· Not shared with friends",
		);

		await impersonate(page, teammate.id);
		await schedule.goto(team.customUrl);
		await schedule.locators.gridViewTab.click();

		await expect(schedule.cellRange(ADMIN_ID, WEDNESDAY)).toBeVisible();

		// adding the team did not quietly restore the friends sharing the dialog opened with
		await impersonate(page, NZAP_TEST_ID);
		await friends.goto();

		await isNotVisible(friends.scheduleButton(ADMIN_ID));
	});
});

function daySlot(dayIndex: number, start: string, end: string) {
	const date = weekDates()[dayIndex];

	return {
		startsAt: Availability.localToTimestamp({
			date,
			time: start,
			timezone: MACHINE_TIMEZONE,
		}),
		endsAt: Availability.localToTimestamp({
			date,
			time: end,
			timezone: MACHINE_TIMEZONE,
		}),
	};
}
