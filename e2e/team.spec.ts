import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { SELECTED_MAP_CLASS } from "./pages/settings/map-mode-preferences-field";
import { JoinTeamPage } from "./pages/team/join-team-page";
import { NewTeamPage } from "./pages/team/new-team-page";
import { TeamEditPage } from "./pages/team/team-edit-page";
import { TeamPage } from "./pages/team/team-page";
import { UserPage } from "./pages/user/user-page";

const TEAM_NAME = "Alliance Rogue";
const SECONDARY_TEAM_NAME = "Team Olive";
const ROSTER_SIZE = 4;
const TOURNAMENT_NAME = "In The Zone 30";

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

		// Owner is Sendou
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

		// move the first member down one slot
		await firstRow.moveDown();

		await expect(firstRow.locators.username).toHaveText(secondName);
		await expect(secondRow.locators.username).toHaveText(firstName);

		await roster.save();

		await team.goto(customUrl);
		await team.openManageRoster();

		// the new order is persisted
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
