import { addWeeks } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import {
	addTeamEventSchema,
	editTeamEventSchema,
} from "~/features/availability/availability-schemas";
import * as Availability from "~/features/availability/core/Availability";
import { weekDates, weekRange } from "./helpers/availability";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	navigate,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { SELECTED_MAP_CLASS } from "./pages/settings/map-mode-preferences-field";
import { JoinTeamPage } from "./pages/team/join-team-page";
import { NewTeamPage } from "./pages/team/new-team-page";
import { TeamEditPage } from "./pages/team/team-edit-page";
import { TeamPage } from "./pages/team/team-page";
import { TeamSchedulePage } from "./pages/team/team-schedule-page";
import { UserPage } from "./pages/user/user-page";

const TEAM_NAME = "Alliance Rogue";
const SECONDARY_TEAM_NAME = "Team Olive";
const ROSTER_SIZE = 4;
const TOURNAMENT_NAME = "In The Zone 30";
const WEDNESDAY = 2;
const THURSDAY = 3;

test.describe("New team creation", () => {
	test("creates new team", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await new AnythingAdder(page).add("team");

		await expect(page).toHaveURL(/t\/new/);

		const newTeam = new NewTeamPage(page);
		await newTeam.form.fill("name", "Chimera");
		await newTeam.form.submit();

		await expect(page).toHaveURL(/chimera/);
	});
});

test.describe("Team page", () => {
	test("edit team info", async ({ page, factories }) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const teamEdit = await team.openEdit();
		await teamEdit.form.fill("name", "Better Alliance Rogue");
		await teamEdit.form.fill("bsky", "BetterAllianceRogue");
		await teamEdit.form.fill("bio", "shorter bio");
		await teamEdit.form.submit();

		await expect(page).toHaveURL(/better-alliance-rogue/);
		await expect(team.locators.bio).toHaveText("shorter bio");
		await expect(team.locators.bskyLink).toHaveAttribute(
			"href",
			"https://bsky.app/profile/BetterAllianceRogue",
		);
	});

	test("edits and removes team map preferences", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);

		const teamEdit = new TeamEditPage(page);
		await teamEdit.goto(customUrl);

		// a team without preferences has nothing to remove
		await isNotVisible(teamEdit.locators.removeMapPreferencesButton);

		await teamEdit.maps.setModePreference("SZ", "Prefer");
		await teamEdit.maps.setModePreference("TW", "Avoid");
		await teamEdit.maps.selectModeTab("SZ");
		await teamEdit.maps.mapButton("SZ", 1).click();
		await teamEdit.saveMapPreferences();

		// reload so the form shows what was actually persisted
		await teamEdit.goto(customUrl);
		await expect(teamEdit.maps.preferenceRadio("SZ", "Prefer")).toBeChecked();
		await expect(teamEdit.maps.preferenceRadio("TW", "Avoid")).toBeChecked();
		await teamEdit.maps.selectModeTab("SZ");
		await expect(teamEdit.maps.mapButton("SZ", 1)).toHaveClass(
			SELECTED_MAP_CLASS,
		);

		await teamEdit.removeMapPreferences();
		await isNotVisible(teamEdit.locators.removeMapPreferencesButton);

		// the form re-syncs in place, so a following save can't restore what was removed
		await expect(teamEdit.maps.preferenceRadio("SZ", "Neutral")).toBeChecked();
		await expect(teamEdit.maps.preferenceRadio("TW", "Neutral")).toBeChecked();
		await teamEdit.maps.selectModeTab("SZ");
		await expect(teamEdit.maps.mapButton("SZ", 1)).not.toHaveClass(
			SELECTED_MAP_CLASS,
		);

		await teamEdit.goto(customUrl);
		await expect(teamEdit.maps.preferenceRadio("SZ", "Neutral")).toBeChecked();
		await isNotVisible(teamEdit.locators.removeMapPreferencesButton);
	});

	test("kicks a member & changes a role", async ({ page, factories }) => {
		const { customUrl } = await createFullTeam(factories);

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		await expect(team.ownerBadge(ADMIN_ID)).toBeVisible();

		const roster = await team.openManageRoster();
		await roster.memberRow(0).selectRole("SUPPORT");

		const lastMember = roster.memberRow(ROSTER_SIZE - 1);
		await expect(lastMember.locators.row).toBeVisible();
		await lastMember.remove();
		await isNotVisible(lastMember.locators.row);

		await roster.save();

		await team.goto(customUrl);

		await expect(team.memberRole(0)).toHaveText("Support");
	});

	test("sets a custom role for a member", async ({ page, factories }) => {
		const { customUrl } = await createFullTeam(factories);

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const roster = await team.openManageRoster();
		await roster.memberRow(1).setCustomRole("Strategist", "OTHER");
		await roster.save();

		await team.goto(customUrl);

		// custom role is classified as "OTHER" so it lives under the "Other" tab
		await team.locators.otherRolesTab.click();
		await expect(team.customRole("Strategist")).toBeVisible();
	});

	test("reorders members via move buttons", async ({ page, factories }) => {
		const { customUrl } = await createFullTeam(factories);

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const roster = await team.openManageRoster();
		const firstRow = roster.memberRow(0);
		const secondRow = roster.memberRow(1);
		const lastRow = roster.memberRow(ROSTER_SIZE - 1);

		const firstName = await firstRow.locators.username.innerText();
		const secondName = await secondRow.locators.username.innerText();
		expect(firstName).not.toBe(secondName);

		// the first member can't move up and the last can't move down
		await expect(firstRow.locators.moveUpButton).toBeDisabled();
		await expect(lastRow.locators.moveDownButton).toBeDisabled();

		await firstRow.moveDown();

		await expect(firstRow.locators.username).toHaveText(secondName);
		await expect(secondRow.locators.username).toHaveText(firstName);

		await roster.save();

		await team.goto(customUrl);
		await team.openManageRoster();

		await expect(firstRow.locators.username).toHaveText(secondName);
	});

	test("shows a finalized tournament placement on the results page", async ({
		page,
		factories,
	}) => {
		const teammates = await factories.UserFactory.createMany(ROSTER_SIZE - 1);
		const memberUserIds = [
			ADMIN_ID,
			...teammates.map((teammate) => teammate.id),
		];
		const { id: teamId, customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds,
		});

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: TOURNAMENT_NAME,
		});
		const linkedTournamentTeam = await factories.TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds,
				team: { name: TEAM_NAME, prefersNotToHost: 0, teamId },
			},
			{ isCheckedIn: true },
		);
		const opponents = await factories.UserFactory.createMany(ROSTER_SIZE);
		await factories.TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: opponents.map((opponent) => opponent.id),
			},
			{ isCheckedIn: true },
		);
		const matches = await factories.TournamentFactory.playOut(
			tournament.id,
			"all",
		);

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const results = await team.openResults();
		await expect(page).toHaveURL(/\/results/);

		const wonTheFinal = matches.some(
			(match) => match.winnerTeamId === linkedTournamentTeam.id,
		);
		await expect(results.resultRow(TOURNAMENT_NAME)).toContainText("/ 2");
		await expect(
			results.placement(TOURNAMENT_NAME, wonTheFinal ? "1st" : "2nd"),
		).toBeVisible();
	});

	test("deletes team", async ({ page, factories }) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		await team.openActionsMenu();
		await team.delete();

		await expect(page).not.toHaveURL(new RegExp(customUrl));
	});

	test("resets invite code, joins team, leaves, rejoins", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const roster = await team.openManageRoster();
		const oldInviteLink = await roster.inviteLink();

		await roster.resetInviteLink();

		await expect(roster.locators.inviteLink).not.toHaveText(oldInviteLink);
		const newInviteLink = await roster.inviteLink();

		await impersonate(page, NZAP_TEST_ID);

		const join = new JoinTeamPage(page);
		await join.goto(newInviteLink);
		await join.join();

		await team.openActionsMenu();
		await team.leave();

		await join.goto(newInviteLink);
		await join.join();

		await team.openActionsMenu();
		await expect(team.locators.leaveTeamButton).toBeVisible();
	});

	test("joins a secondary team, makes main team & leaves making the seconary team the main one", async ({
		page,
		factories,
	}) => {
		await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID],
		});
		const secondaryTeamOwner = await factories.UserFactory.create();
		const { customUrl: secondaryCustomUrl } =
			await factories.TeamFactory.create({
				name: SECONDARY_TEAM_NAME,
				memberUserIds: [secondaryTeamOwner.id],
			});

		await impersonate(page, secondaryTeamOwner.id);

		const secondaryTeam = new TeamPage(page);
		await secondaryTeam.goto(secondaryCustomUrl);

		const roster = await secondaryTeam.openManageRoster();
		const inviteLink = await roster.inviteLink();

		await impersonate(page, ADMIN_ID);

		const join = new JoinTeamPage(page);
		await join.goto(inviteLink);
		await join.join();

		await secondaryTeam.openActionsMenu();
		await secondaryTeam.makeMainTeam();

		const user = new UserPage(page);
		await user.goto(ADMIN_DISCORD_ID);

		await expect(user.locators.secondaryTeamsTrigger).toBeVisible();
		await expect(user.locators.mainTeamLink).not.toContainText(TEAM_NAME);

		const mainTeam = await user.openMainTeam();

		await mainTeam.openActionsMenu();
		await expect(mainTeam.locators.mainTeamIndicator).toBeVisible();
		await mainTeam.leave();

		await user.goto(ADMIN_DISCORD_ID);

		await isNotVisible(user.locators.secondaryTeamsTrigger);
		await expect(user.locators.mainTeamLink).toContainText(TEAM_NAME);
	});

	test("makes another user editor, who can edit the page & becomes owner after the original leaves", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID, NZAP_TEST_ID],
		});

		await impersonate(page, ADMIN_ID);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const roster = await team.openManageRoster();
		// the owner has no editor toggle, so the first one belongs to N-ZAP
		await roster.makeEditor(0);
		await roster.save();

		await impersonate(page, NZAP_TEST_ID);

		const teamEdit = new TeamEditPage(page);
		await teamEdit.goto(customUrl);
		await teamEdit.form.fill("bio", "from editor");
		await teamEdit.form.submit();

		await expect(page).toHaveURL(new RegExp(customUrl));
		await expect(team.locators.bio).toHaveText("from editor");

		await impersonate(page, ADMIN_ID);
		await team.goto(customUrl);

		await team.openActionsMenu();
		await team.startLeaving();
		await expect(team.locators.confirmDialog).toContainText(
			"New owner will be N-ZAP",
		);
		await team.confirmLeaving();

		await expect(team.ownerBadge(NZAP_TEST_ID)).toBeVisible();
		await isNotVisible(team.locators.actionsMenuButton);
	});
});

/** A team of the admin and three others, the admin its owner and first member. */
async function createFullTeam(factories: Factories) {
	const members = await factories.UserFactory.createMany(ROSTER_SIZE - 1);

	return factories.TeamFactory.create({
		name: TEAM_NAME,
		memberUserIds: [ADMIN_ID, ...members.map((member) => member.id)],
	});
}

test.describe("Team schedule", () => {
	test("member sees the grid states and playable windows", async ({
		page,
		factories,
	}) => {
		const noScheduleMember = await factories.UserFactory.create();
		const { id: teamId, customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID, NZAP_TEST_ID, noScheduleMember.id],
		});

		const { startsAt } = weekRange();
		await factories.AvailabilityWeekFactory.create({
			userId: ADMIN_ID,
			weekStartsAt: startsAt,
			timezone: MACHINE_TIMEZONE,
			// the small-hours slot guards day bucketing: on machines off UTC it
			// falls on another UTC day, so it moves columns if the server ignores
			// the viewer's timezone
			slots: [
				daySlot(WEDNESDAY, "18:00", "22:00"),
				daySlot(THURSDAY, "00:30", "02:00"),
			],
			dayNotes: [{ date: weekDates()[WEDNESDAY], text: "Leaving early" }],
		});
		await factories.AvailabilityWeekFactory.create({
			userId: NZAP_TEST_ID,
			weekStartsAt: startsAt,
			timezone: MACHINE_TIMEZONE,
			slots: [daySlot(WEDNESDAY, "19:00", "23:00")],
		});
		// a commitment late in the shared Wednesday evening: renders as a busy
		// block and trims effective availability without removing the window
		await factories.TeamEventFactory.create({
			teamId,
			authorId: ADMIN_ID,
			name: "VoD review",
			...daySlot(WEDNESDAY, "22:00", "23:30"),
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const team = new TeamPage(page);
		await team.goto(customUrl);

		const schedule = await team.openSchedule();
		await expect(schedule.locators.grid).toBeVisible();

		await expect(schedule.cellRange(ADMIN_ID, WEDNESDAY)).toBeVisible();
		await expect(schedule.cellRange(ADMIN_ID, THURSDAY)).toBeVisible();
		await expect(schedule.cell(ADMIN_ID, 0)).toHaveText("—");
		await expect(schedule.cell(noScheduleMember.id, 0)).toHaveText("?");
		await expect(schedule.cellBusy(NZAP_TEST_ID, WEDNESDAY)).toHaveText(
			"VoD review",
		);
		await expect(schedule.locators.notes).toContainText("Leaving early");

		// two members share Wed 19-22 while the third has no schedule, so the
		// only playable window is the one-short tier
		await expect(schedule.locators.windows).toHaveText(/Wed/);
		await expect(schedule.dayDot(WEDNESDAY)).toBeVisible();
		await isNotVisible(schedule.dayDot(0));

		await expect(schedule.locators.teamEvents).toContainText("VoD review");
	});

	test("hides the schedule from non-members, a friend of a member included", async ({
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

	test("owner adds, edits and deletes a team event, a regular member only sees it", async ({
		page,
		factories,
	}) => {
		const { customUrl } = await factories.TeamFactory.create({
			name: TEAM_NAME,
			memberUserIds: [ADMIN_ID, NZAP_TEST_ID],
		});

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const schedule = new TeamSchedulePage(page);
		await schedule.goto(customUrl);

		await schedule.locators.addEventButton.click();
		const form = createFormHelpers(page, addTeamEventSchema);
		await form.fill("name", "VoD review vs. FTWin");
		await form.setDateTime("startsAt", nextWeekTime(WEDNESDAY, "20:00"));
		await form.select("duration", "90");
		await form.submit();

		await schedule.locators.nextWeekToggle.click();
		await expect(schedule.locators.teamEvents).toContainText(
			"VoD review vs. FTWin",
		);

		await page.getByTestId(/edit-team-event/).click();
		const editForm = createFormHelpers(page, editTeamEventSchema);
		await editForm.fill("name", "Strategy meeting");
		await editForm.checkItems("participants", ["SELECTED"]);
		await page.getByLabel("N-ZAP", { exact: true }).click();
		await editForm.submit();

		await expect(schedule.locators.teamEvents).toContainText(
			"Strategy meeting",
		);
		await expect(schedule.locators.teamEvents).toContainText("N-ZAP");

		await impersonate(page, NZAP_TEST_ID);
		await schedule.goto(customUrl);
		await schedule.locators.nextWeekToggle.click();
		await expect(schedule.locators.teamEvents).toBeVisible();
		await isNotVisible(schedule.locators.addEventButton);
		await isNotVisible(page.getByTestId(/delete-team-event/));

		await impersonate(page, ADMIN_ID);
		await schedule.goto(customUrl);
		await schedule.locators.nextWeekToggle.click();
		await page.getByTestId(/delete-team-event/).click();
		await page.getByTestId("confirm-button").click();
		await isNotVisible(schedule.locators.teamEvents);
	});
});

/** Wall-clock time on a day of next week, always ahead of "now" so the add-event form accepts it. */
function nextWeekTime(dayIndex: number, time: string) {
	const date = weekDates(addWeeks(new Date(), 1))[dayIndex];

	return new Date(
		Availability.localToTimestamp({ date, time, timezone: MACHINE_TIMEZONE }) *
			1000,
	);
}

function daySlot(dayIndex: number, start: string, end: string) {
	const dates = weekDates();

	return {
		startsAt: Availability.localToTimestamp({
			date: dates[dayIndex],
			time: start,
			timezone: MACHINE_TIMEZONE,
		}),
		endsAt: Availability.localToTimestamp({
			date: dates[dayIndex],
			time: end,
			timezone: MACHINE_TIMEZONE,
		}),
	};
}
