import { addHours } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentAdminRegistrationPage } from "./pages/tournament/tournament-admin-registration-page";
import { TournamentRegisterPage } from "./pages/tournament/tournament-register-page";
import { TournamentTeamsPage } from "./pages/tournament/tournament-teams-page";

test.describe("Invitational tournament", () => {
	test("team can't register on their own, the TO adds them instead", async ({
		page,
		factories,
	}) => {
		const tournament = await createInvitational(factories);
		const captain = await factories.UserFactory.create({
			discordName: "Captain Carla",
		});

		await impersonate(page, captain.id);

		const register = new TournamentRegisterPage(page);
		await register.goto(tournament.id);
		await expect(register.locators.registrationClosedAlert).toBeVisible();
		await expect(register.nav.locators.registerTab).toHaveCount(0);

		await impersonate(page, NZAP_TEST_ID);

		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoNew(tournament.id);
		await expect(registration.locators.addHeading).toBeVisible();

		await registration.form.fill("pickUpName", "Invited Squad");
		await registration.selectPlayer("Captain Carla");
		await registration.selectCaptain(captain.id);
		await registration.save();

		const admin = new TournamentAdminPage(page);
		await expect(admin.teamName("Invited Squad")).toBeVisible();

		await impersonate(page, captain.id);

		const teams = new TournamentTeamsPage(page);
		await teams.goto(tournament.id);
		await expect(teams.teamNamed("Invited Squad")).toBeVisible();
		await expect(teams.memberNamed("Captain Carla")).toBeVisible();

		// as the captain of an invitational team they can now manage the registration
		await expect(register.nav.locators.registerTab).toBeVisible();
	});

	test("member added by the TO can't leave the team", async ({
		page,
		factories,
	}) => {
		const tournament = await createInvitational(factories);
		const captain = await factories.UserFactory.create({
			discordName: "Captain Carla",
		});
		const member = await factories.UserFactory.create({
			discordName: "Member Mia",
		});

		await impersonate(page, NZAP_TEST_ID);

		const registration = new TournamentAdminRegistrationPage(page);
		await registration.gotoNew(tournament.id);
		await expect(registration.locators.addHeading).toBeVisible();

		await registration.form.fill("pickUpName", "Invited Squad");
		await registration.selectPlayer("Captain Carla");
		await registration.addMember("Member Mia");
		await registration.selectCaptain(captain.id);
		await registration.save();

		const admin = new TournamentAdminPage(page);
		await expect(admin.teamName("Invited Squad")).toBeVisible();

		await impersonate(page, member.id);

		const register = new TournamentRegisterPage(page);
		await register.goto(tournament.id);
		await register.locators.leaveTeamButton.click();
		await expect(
			register.locators.organizerAddedLeaveExplanation,
		).toBeVisible();
	});
});

function createInvitational(factories: Factories) {
	return factories.TournamentFactory.create({
		authorId: NZAP_TEST_ID,
		isInvitational: true,
		startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
	});
}
