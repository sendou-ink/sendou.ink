import { addHours, addWeeks, subWeeks } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	addTeamEventSchema,
	editTeamEventSchema,
} from "~/features/availability/availability-schemas";
import * as Availability from "~/features/availability/core/Availability";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { weekDates, weekRange } from "./helpers/availability";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";
import { createNamedUsers } from "./helpers/sidebar";
import { EventsPage } from "./pages/calendar/events-page";
import { FriendsPage } from "./pages/friends/friends-page";
import { TeamPage } from "./pages/team/team-page";
import { TeamSchedulePage } from "./pages/team/team-schedule-page";

const JOINED_TOURNAMENT_NAME = "Joined Tournament";
const ORGANIZED_TOURNAMENT_NAME = "Organized Tournament";
const TEAM_NAME = "Team Olive";
const TEAM_EVENT_NAME = "VoD review";
const DAY_NOTE = "Leaving early";
const WEDNESDAY = 2;
const THURSDAY = 3;
const ALL_FRIENDS = "All friends";

test.describe("My events", () => {
	test("lists the user's events by category and links to them", async ({
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
	/**
	 * The current and the next week can be filled in, each saved as a whole. A week never saved is
	 * marked "not filled", while a week saved empty means unavailable all week.
	 */
	test.describe("Filling in a week", () => {
		test("a saved week keeps its ranges and notes and is no longer marked not filled", async ({
			page,
		}) => {
			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();

			await expect(events.weekNotFilledMarker("current")).toBeVisible();

			await events.fillInDay(WEDNESDAY, {
				start: "18:00",
				end: "22:00",
				note: DAY_NOTE,
			});
			await expect(events.locators.availabilityBars).toHaveCount(1);

			await events.saveWeek();

			await events.goto();
			await expect(events.locators.availabilityBars).toHaveCount(1);
			await isNotVisible(events.weekNotFilledMarker("current"));
			await expect(events.weekNotFilledMarker("next")).toBeVisible();

			await events.dayEditButton(WEDNESDAY).click();
			await expect(events.dayNote()).toHaveValue(DAY_NOTE);
		});

		test("a week saved empty after confirming is not marked not filled", async ({
			page,
			factories,
		}) => {
			await factories.AvailabilityWeekFactory.create({
				userId: ADMIN_ID,
				weekStartsAt: weekRange().startsAt,
				timezone: MACHINE_TIMEZONE,
				slots: [daySlot(WEDNESDAY, "18:00", "22:00")],
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();

			// deleting the only range commits instantly: the popover closes and the
			// bar disappears without waiting for a popover close + save
			await events.deleteOnlyRange(WEDNESDAY);
			await isNotVisible(events.locators.dayEditorPopover);
			await isNotVisible(events.locators.availabilityBars);

			await events.saveEmptyWeek();

			await events.goto();
			await isNotVisible(events.locators.availabilityBars);
			await isNotVisible(events.weekNotFilledMarker("current"));
		});

		test("leaving the page with unsaved changes warns first", async ({
			page,
		}) => {
			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();

			await events.fillInDay(WEDNESDAY, { start: "18:00", end: "22:00" });

			await page
				.getByRole("link", { name: "Find an event to join on the calendar!" })
				.click();
			await page.getByText("Unsaved changes").waitFor();
			await page.getByRole("button", { name: "Cancel" }).click();

			await expect(page).toHaveURL(/\/events/);
			await expect(events.locators.availabilityBars).toHaveCount(1);
		});

		test("copies last week's ranges into the current week", async ({
			page,
			factories,
		}) => {
			const lastWeek = subWeeks(new Date(), 1);
			await factories.AvailabilityWeekFactory.create({
				userId: ADMIN_ID,
				weekStartsAt: weekRange(lastWeek).startsAt,
				timezone: MACHINE_TIMEZONE,
				slots: [daySlot(WEDNESDAY, "19:00", "21:00", lastWeek)],
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();

			await isNotVisible(events.locators.availabilityBars);
			await events.copyLastWeek();
			await expect(events.locators.availabilityBars).toHaveCount(1);

			await events.saveWeek();
		});

		test("copies the current week's ranges into the next week", async ({
			page,
			factories,
		}) => {
			await factories.AvailabilityWeekFactory.create({
				userId: ADMIN_ID,
				weekStartsAt: weekRange().startsAt,
				timezone: MACHINE_TIMEZONE,
				slots: [daySlot(WEDNESDAY, "19:00", "21:00")],
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();
			await events.openNextWeek();

			await isNotVisible(events.locators.availabilityBars);
			await events.copyLastWeek();
			await expect(events.locators.availabilityBars).toHaveCount(1);
		});
	});

	/** Ranges are also painted by dragging across a day's track, and moved by dragging them. */
	test.describe("Painting", () => {
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
	});

	/** Team events and tournaments the user is registered to show on the editor as locked blocks. */
	test.describe("Commitments", () => {
		test("shows a team event as a locked block named after it", async ({
			page,
			factories,
		}) => {
			const team = await factories.TeamFactory.create({
				memberUserIds: [ADMIN_ID],
			});
			await factories.TeamEventFactory.create({
				teamId: team.id,
				authorId: ADMIN_ID,
				name: TEAM_EVENT_NAME,
				...daySlot(WEDNESDAY, "20:00", "21:30"),
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();

			await expect(events.locators.commitments).toHaveText(TEAM_EVENT_NAME);
		});

		test("shows a tournament registered to as a locked block named after it", async ({
			page,
			factories,
		}) => {
			const nextWeek = addWeeks(new Date(), 1);
			const tournament = await factories.TournamentFactory.create({
				authorId: NZAP_TEST_ID,
				name: JOINED_TOURNAMENT_NAME,
				startTimes: [daySlot(WEDNESDAY, "18:00", "19:00", nextWeek).startsAt],
			});
			await factories.TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [ADMIN_ID],
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);

			const events = new EventsPage(page);
			await events.goto();
			await events.openNextWeek();

			await expect(events.locators.commitments).toHaveText(
				JOINED_TOURNAMENT_NAME,
			);
		});
	});
});

/**
 * A schedule is shared with everyone until limited to an allow-list of all friends and chosen
 * teams. A team joined after that starts outside the list; the editor names who is left out.
 */
test.describe("Schedule visibility", () => {
	test("a friend no longer sees the schedule once friends are left out", async ({
		page,
		factories,
	}) => {
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
		const events = new EventsPage(page);

		await test.step("N-ZAP sees Sendou's schedule on the friends page", async () => {
			await impersonate(page, NZAP_TEST_ID);
			await setTimezoneCookie(page);
			await friends.goto();

			await expect(friends.scheduleButton(ADMIN_ID)).toBeVisible();
		});

		await test.step("Sendou stops sharing with friends", async () => {
			await impersonate(page, ADMIN_ID);
			await events.goto();

			// nothing restricted yet, so the editor says nothing about who is left out
			await isNotVisible(events.locators.notSharedWith);

			await events.setScheduleVisibility({ uncheck: [ALL_FRIENDS] });

			await expect(events.locators.visibilityButton).toHaveText("Limited");
			await expect(events.locators.notSharedWith).toHaveText(
				"· Not shared with friends",
			);
		});

		await test.step("N-ZAP no longer sees it", async () => {
			await impersonate(page, NZAP_TEST_ID);
			await friends.goto();

			await isNotVisible(friends.scheduleButton(ADMIN_ID));
		});
	});

	test("a team joined after limiting is left out until it is added", async ({
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
		await factories.UserFactory.grant(ADMIN_ID, {
			preferences: { scheduleVisibility: { friends: false, teamIds: [] } },
		});
		const team = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [teammate.id, ADMIN_ID],
		});
		const schedule = new TeamSchedulePage(page);
		const events = new EventsPage(page);

		await test.step("The teammate doesn't see Sendou's time on the team schedule", async () => {
			await impersonate(page, teammate.id);
			await setTimezoneCookie(page);
			await schedule.goto(team.customUrl);
			await schedule.openGridView();

			await isNotVisible(schedule.cellRange(ADMIN_ID, WEDNESDAY));
		});

		await test.step("Sendou sees the team named as left out and adds it", async () => {
			await impersonate(page, ADMIN_ID);
			await events.goto();

			await expect(events.locators.notSharedWith).toHaveText(
				`· Not shared with friends and ${TEAM_NAME}`,
			);

			await events.setScheduleVisibility({ check: [TEAM_NAME] });

			await expect(events.locators.notSharedWith).toHaveText(
				"· Not shared with friends",
			);
		});

		await test.step("The teammate now sees Sendou's time", async () => {
			await impersonate(page, teammate.id);
			await schedule.goto(team.customUrl);
			await schedule.openGridView();

			await expect(schedule.cellRange(ADMIN_ID, WEDNESDAY)).toBeVisible();
		});

		await test.step("Friends stay left out, N-ZAP still not seeing it", async () => {
			await impersonate(page, NZAP_TEST_ID);
			const friends = new FriendsPage(page);
			await friends.goto();

			await isNotVisible(friends.scheduleButton(ADMIN_ID));
		});
	});
});

/** Only the team's members see its schedule, which shows the week the editor showed. */
test.describe("Team schedule", () => {
	test("a non-member can't see it, not even a friend of a member", async ({
		page,
		factories,
	}) => {
		const friend = await factories.UserFactory.create();
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});
		await factories.FriendshipFactory.create({
			userOneId: ADMIN_ID,
			userTwoId: friend.id,
		});
		await factories.AvailabilityWeekFactory.create({
			userId: ADMIN_ID,
			weekStartsAt: weekRange().startsAt,
			timezone: MACHINE_TIMEZONE,
			slots: [daySlot(WEDNESDAY, "18:00", "22:00")],
		});

		await impersonate(page, friend.id);

		const schedule = new TeamSchedulePage(page);
		await schedule.goto(customUrl);
		await expect(schedule.locators.hiddenMessage).toBeVisible();
		await isNotVisible(schedule.locators.grid);
	});

	test("the week shown carries over to the editor and back", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const events = new EventsPage(page);
		await events.goto();
		await events.openNextWeek();

		const schedule = await events.openTeamSchedule();
		await expect(page).toHaveURL(
			new RegExp(`/t/${customUrl}/schedule\\?week=next`),
		);
		await expect(schedule.locators.heatmap).toBeVisible();

		await schedule.editOwnAvailability();
		await expect(page).toHaveURL(/\/events\?week=next/);
		await expect(events.weekNotFilledMarker("next")).toBeVisible();
	});

	/** The heatmap, the default view, shades the week by how many members are free at once. */
	test.describe("Heatmap", () => {
		test("shades the time by how many members are free", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const team = new TeamPage(page);
			await team.goto(customUrl);
			const schedule = await team.openSchedule();

			// two share Wed 19-22, one is also free Wed 18-19 and Thu 1-2
			await expect(schedule.locators.heatmap).toBeVisible();
			await expect(schedule.heatmapCells(2)).toHaveCount(3);
			await expect(schedule.heatmapCells(1)).toHaveCount(2);
			// the count shade must actually paint: an equal-specificity base background once blanked the whole grid
			expect(await schedule.heatmapCellBackground(2)).not.toBe(
				await schedule.heatmapCellBackground(0),
			);
		});

		test("hovering a block names who is free then and who has no schedule", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);

			await schedule.heatmapCells(2).first().hover();

			await expect(schedule.locators.heatmapTooltip).toContainText("2/3");
			await expect(schedule.locators.heatmapTooltip).toContainText("N-ZAP");
			await expect(schedule.locators.heatmapTooltip).toContainText(
				"Schedules-Later",
			);
		});

		test("leaving a member without a schedule out of the count drops them from the nudge", async ({
			page,
			factories,
		}) => {
			const { customUrl, noScheduleMember } =
				await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);

			await expect(schedule.locators.heatmapUnreported).toContainText(
				"Schedules-Later",
			);

			await schedule.toggleMemberInCount(noScheduleMember.id);

			await isNotVisible(schedule.locators.heatmapUnreported);
		});
	});

	/** The grid lists each member's days: "—" for a filled-in week's empty day, "?" without a schedule. */
	test.describe("Grid", () => {
		test("shows each member's ranges, unavailable days and missing schedules", async ({
			page,
			factories,
		}) => {
			const { customUrl, noScheduleMember } =
				await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);
			await schedule.openGridView();

			// the small-hours slot guards day bucketing: on machines off UTC it
			// falls on another UTC day, so it moves columns if the server ignores
			// the viewer's timezone
			await expect(schedule.cellRange(ADMIN_ID, WEDNESDAY)).toBeVisible();
			await expect(schedule.cellRange(ADMIN_ID, THURSDAY)).toBeVisible();
			await expect(schedule.cell(ADMIN_ID, 0)).toHaveText("—");
			await expect(schedule.cell(noScheduleMember.id, 0)).toHaveText("?");
			await expect(schedule.locators.notes).toContainText(DAY_NOTE);
		});

		test("names a commitment beside the reported time instead of cutting it out", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);
			await schedule.openGridView();

			// N-ZAP reported 19-23 and the team event takes 22-23:30
			await expect(schedule.cellRange(NZAP_TEST_ID, WEDNESDAY)).toContainText(
				"11:00",
			);
			await expect(schedule.cellBusy(NZAP_TEST_ID, WEDNESDAY)).toContainText(
				TEAM_EVENT_NAME,
			);
			await expect(schedule.cellBusy(NZAP_TEST_ID, WEDNESDAY)).toContainText(
				"10:00",
			);
		});
	});

	/**
	 * A playable window is an hour or more with enough players free throughout: four, or every player
	 * of a smaller roster. One player short, it is a window "with a sub". Commitments are cut out first.
	 */
	test.describe("Playable windows", () => {
		test("two of three free is a window with a sub, marked on its day", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await teamWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);

			await expect(schedule.playableWindows("withSub")).toHaveText(/Wed/);
			await isNotVisible(schedule.playableWindows("full"));
			await expect(schedule.dayDot(WEDNESDAY)).toBeVisible();
			await isNotVisible(schedule.dayDot(0));
		});

		test("a roster of two free together can play without a sub", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await factories.TeamFactory.create({
				name: TEAM_NAME,
				memberUserIds: [ADMIN_ID, NZAP_TEST_ID],
			});
			for (const userId of [ADMIN_ID, NZAP_TEST_ID]) {
				await factories.AvailabilityWeekFactory.create({
					userId,
					weekStartsAt: weekRange().startsAt,
					timezone: MACHINE_TIMEZONE,
					slots: [daySlot(WEDNESDAY, "19:00", "22:00")],
				});
			}

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(customUrl);

			await expect(schedule.playableWindows("full")).toHaveText(/Wed/);
		});
	});

	/**
	 * Team events block their participants' time, the whole team's unless limited to chosen members.
	 * Only those who can edit the team add, edit and delete them.
	 */
	test.describe("Team events", () => {
		test("the owner adds an event the team then sees", async ({
			page,
			factories,
		}) => {
			const { customUrl } = await factories.TeamFactory.create({
				name: TEAM_NAME,
				memberUserIds: [ADMIN_ID, NZAP_TEST_ID],
			});
			const schedule = new TeamSchedulePage(page);

			await test.step("Sendou adds a team event for next Wednesday", async () => {
				await impersonate(page, ADMIN_ID);
				await setTimezoneCookie(page);
				await schedule.goto(customUrl);

				await schedule.startAddingEvent();
				const form = createFormHelpers(page, addTeamEventSchema);
				await form.fill("name", TEAM_EVENT_NAME);
				await form.setDateTime("startsAt", nextWeekTime(WEDNESDAY, "20:00"));
				await form.select("duration", "90");
				await form.submit();

				await schedule.openNextWeek();
				await expect(schedule.locators.teamEvents).toContainText(
					TEAM_EVENT_NAME,
				);
			});

			await test.step("N-ZAP sees it but can't change it", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await setTimezoneCookie(page);
				await schedule.goto(customUrl);
				await schedule.openNextWeek();

				await expect(schedule.locators.teamEvents).toContainText(
					TEAM_EVENT_NAME,
				);
				await isNotVisible(schedule.locators.addEventButton);
				await isNotVisible(schedule.locators.deleteEventButtons);
			});
		});

		test("the owner limits an event to selected participants", async ({
			page,
			factories,
		}) => {
			const team = await factories.TeamFactory.create({
				name: TEAM_NAME,
				memberUserIds: [ADMIN_ID, NZAP_TEST_ID],
			});
			await factories.TeamEventFactory.create({
				teamId: team.id,
				authorId: ADMIN_ID,
				name: TEAM_EVENT_NAME,
				...daySlot(WEDNESDAY, "20:00", "21:30", addWeeks(new Date(), 1)),
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(team.customUrl);
			await schedule.openNextWeek();

			await schedule.startEditingEvent();
			const form = createFormHelpers(page, editTeamEventSchema);
			await form.fill("name", "Strategy meeting");
			await form.checkItems("participants", ["SELECTED"]);
			await schedule.pickParticipant("N-ZAP");
			await form.submit();

			await expect(schedule.locators.teamEvents).toContainText(
				"Strategy meeting",
			);
			await expect(schedule.locators.teamEvents).toContainText("N-ZAP");
		});

		test("the owner deletes an event", async ({ page, factories }) => {
			const team = await factories.TeamFactory.create({
				name: TEAM_NAME,
				memberUserIds: [ADMIN_ID],
			});
			await factories.TeamEventFactory.create({
				teamId: team.id,
				authorId: ADMIN_ID,
				name: TEAM_EVENT_NAME,
				...daySlot(WEDNESDAY, "20:00", "21:30", addWeeks(new Date(), 1)),
			});

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const schedule = new TeamSchedulePage(page);
			await schedule.goto(team.customUrl);
			await schedule.openNextWeek();

			await schedule.deleteEvent();

			await isNotVisible(schedule.locators.teamEvents);
		});
	});
});

/**
 * A team of Sendou, N-ZAP and Schedules-Later, who hasn't filled in the week. Sendou is free
 * Wednesday 18-22 (with a note) and Thursday 0:30-2, N-ZAP Wednesday 19-23 with a team event at
 * 22-23:30 taking the end of it.
 */
async function teamWithSchedules(factories: Factories) {
	const noScheduleMember = await factories.UserFactory.create({
		discordName: "Schedules-Later",
	});
	const team = await factories.TeamFactory.create({
		name: TEAM_NAME,
		memberUserIds: [ADMIN_ID, NZAP_TEST_ID, noScheduleMember.id],
	});

	const { startsAt } = weekRange();
	await factories.AvailabilityWeekFactory.create({
		userId: ADMIN_ID,
		weekStartsAt: startsAt,
		timezone: MACHINE_TIMEZONE,
		slots: [
			daySlot(WEDNESDAY, "18:00", "22:00"),
			daySlot(THURSDAY, "00:30", "02:00"),
		],
		dayNotes: [{ date: weekDates()[WEDNESDAY], text: DAY_NOTE }],
	});
	await factories.AvailabilityWeekFactory.create({
		userId: NZAP_TEST_ID,
		weekStartsAt: startsAt,
		timezone: MACHINE_TIMEZONE,
		slots: [daySlot(WEDNESDAY, "19:00", "23:00")],
	});
	await factories.TeamEventFactory.create({
		teamId: team.id,
		authorId: ADMIN_ID,
		name: TEAM_EVENT_NAME,
		...daySlot(WEDNESDAY, "22:00", "23:30"),
	});

	return { customUrl: team.customUrl, noScheduleMember };
}

/** A range on a day of the week `date` (default: now) falls in, on the test machine's clock. */
function daySlot(
	dayIndex: number,
	start: string,
	end: string,
	date = new Date(),
) {
	const day = weekDates(date)[dayIndex];

	return {
		startsAt: Availability.localToTimestamp({
			date: day,
			time: start,
			timezone: MACHINE_TIMEZONE,
		}),
		endsAt: Availability.localToTimestamp({
			date: day,
			time: end,
			timezone: MACHINE_TIMEZONE,
		}),
	};
}

/** Wall-clock time on a day of next week, always ahead of "now" so the add-event form accepts it. */
function nextWeekTime(dayIndex: number, time: string) {
	return new Date(
		daySlot(dayIndex, time, time, addWeeks(new Date(), 1)).startsAt * 1000,
	);
}
