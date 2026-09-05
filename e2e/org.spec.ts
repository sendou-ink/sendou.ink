import { addHours, subMonths } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { ESTABLISHED_ORG } from "~/features/tournament-organization/tournament-organization-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";
import { CalendarNewEventPage } from "./pages/calendar/calendar-new-event-page";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { NewOrganizationPage } from "./pages/org/new-organization-page";
import { OrganizationPage } from "./pages/org/organization-page";
import { TournamentPage } from "./pages/tournament/tournament-page";

const ORGANIZATION_NAME = "Sendou.ink";
const TOURNAMENT_NAME = "PICNIC #2";
const PLAYER_NAME = "Banned Bob";

test.describe("Tournament Organization", () => {
	test("can create a new organization", async ({ page, factories }) => {
		const organizer = await factories.UserFactory.create(null, {
			roles: ["TOURNAMENT_ORGANIZER"],
		});

		await impersonate(page, organizer.id);
		await navigate({ page, url: "/" });

		await new AnythingAdder(page).add("organization");

		const newOrganization = new NewOrganizationPage(page);
		await newOrganization.form.fill("name", "Test Organization");
		await newOrganization.save();

		const organization = new OrganizationPage(page);
		await expect(organization.locators.editButton).toBeVisible();
	});

	test("user can be promoted to admin gaining org controls and can edit tournaments", async ({
		page,
		factories,
	}) => {
		const org = await factories.TournamentOrganizationFactory.create(
			{ ownerId: ADMIN_ID, name: ORGANIZATION_NAME },
			{ members: [{ userId: NZAP_TEST_ID, role: "MEMBER" }] },
		);
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: TOURNAMENT_NAME,
			organizationId: org.id,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		const organization = new OrganizationPage(page);

		await impersonate(page, NZAP_TEST_ID);
		await organization.goto(org.slug);
		await isNotVisible(organization.locators.editButton);

		await impersonate(page, ADMIN_ID);
		await organization.goto(org.slug);
		const organizationEdit = await organization.openEdit();
		await organizationEdit.setMemberRole("N-ZAP", "ADMIN");
		await organizationEdit.save();

		// Establish the organization so its admins can edit tournament event info
		await organization.goto(org.slug);
		await organization.establish();

		await impersonate(page, NZAP_TEST_ID);
		await organization.goto(org.slug);
		await organization.openEdit();
		await expect(organizationEdit.locators.title).toBeVisible();

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		const tournamentAdmin = await tournamentPage.nav.openAdmin();
		const calendarEvent = await tournamentAdmin.editEventInfo();
		await expect(calendarEvent.locators.nameInput).toHaveValue(TOURNAMENT_NAME);
	});

	test("banned player cannot join a tournament of that organization", async ({
		page,
		factories,
	}) => {
		const player = await factories.UserFactory.create({
			discordName: PLAYER_NAME,
		});
		const org = await factories.TournamentOrganizationFactory.create({
			ownerId: ADMIN_ID,
			name: ORGANIZATION_NAME,
		});
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: TOURNAMENT_NAME,
			organizationId: org.id,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		const organization = new OrganizationPage(page);
		const tournamentPage = new TournamentPage(page);

		await impersonate(page, ADMIN_ID);
		await organization.goto(org.slug);
		await organization.openBannedUsers();

		const banModal = await organization.openBanModal();
		await expect(banModal.locators.dialog).toBeVisible();
		await banModal.selectUser(PLAYER_NAME);
		await banModal.form.fill("privateNote", "Test reason");
		// a future expiration date to avoid validation issues
		await banModal.form.setDateTime("expiresAt", addHours(new Date(), 24));
		await banModal.save();

		await expect(organization.locators.bannedUsersTable).toContainText(
			"Test reason",
		);

		await impersonate(page, player.id);
		await tournamentPage.goto(tournament.id);

		const register = await tournamentPage.register();
		await register.form.fill("pickUpName", "Banned Team");
		await waitForPOSTResponse(page, () => register.form.submit());

		// "Fill roster" only appears after a successful registration
		await expect(register.locators.fillRosterHeading).not.toBeVisible();

		await impersonate(page, ADMIN_ID);
		await organization.goto(org.slug);
		await organization.openBannedUsers();
		await organization.unban();

		await impersonate(page, player.id);
		await tournamentPage.goto(tournament.id);
		const registerAgain = await tournamentPage.register();

		const teamsTab = tournamentPage.nav.locators.teamsTab;
		await expect(teamsTab).toContainText("Teams (0)");

		await registerAgain.form.fill("pickUpName", "Unbanned Team");
		await registerAgain.form.submit();

		await expect(teamsTab).toContainText("Teams (1)");

		await impersonate(page, ADMIN_ID);
		await organization.goto(org.slug);
		await organization.openBannedUsers();

		const permanentBanModal = await organization.openBanModal();
		await expect(permanentBanModal.locators.dialog).toBeVisible();
		await permanentBanModal.selectUser(PLAYER_NAME);
		await permanentBanModal.form.fill("privateNote", "Does not expire");
		// expiresAt left empty makes the ban permanent
		await permanentBanModal.save();

		await expect(organization.locators.bannedUsersTable).toContainText(
			"Permanent",
		);
	});

	test("shows org admin the stats counting a played tournament's participants", async ({
		page,
		factories,
	}) => {
		const PLAYER_COUNT = 8;

		const org = await factories.TournamentOrganizationFactory.create({
			ownerId: ADMIN_ID,
			name: ORGANIZATION_NAME,
		});

		const players = await factories.UserFactory.createMany(PLAYER_COUNT - 1);
		const playerIds = [ADMIN_ID, ...players.map((player) => player.id)];
		const teamRosters = [playerIds.slice(0, 4), playerIds.slice(4, 8)];

		// only full months before the current one count towards the stats
		const lastMonth = subMonths(new Date(), 1);
		await factories.TournamentFactory.createPlayed(
			{
				authorId: ADMIN_ID,
				name: TOURNAMENT_NAME,
				organizationId: org.id,
				startTimes: [dateToDatabaseTimestamp(lastMonth)],
			},
			{ teamRosters },
		);

		const organization = new OrganizationPage(page);

		// a non-member sees no stats button
		await impersonate(page, NZAP_TEST_ID);
		await organization.goto(org.slug);
		await isNotVisible(organization.locators.statsButton);

		await impersonate(page, ADMIN_ID);
		await organization.goto(org.slug);
		const stats = await organization.openStats();

		const expectedAverage = (
			PLAYER_COUNT / ESTABLISHED_ORG.MONTHS_CONSIDERED
		).toFixed(1);
		await expect(stats.locators.establishedStatus).toContainText(
			expectedAverage,
		);
		await expect(stats.locators.establishedStatus).toContainText(
			`/ ${ESTABLISHED_ORG.GAIN_THRESHOLD}`,
		);
		await expect(stats.monthRow(lastMonth)).toHaveAttribute(
			"aria-valuenow",
			String(PLAYER_COUNT),
		);
	});

	test("allows member of established org to create tournament", async ({
		page,
		factories,
	}) => {
		const orgAdmin = await factories.UserFactory.create();
		const org = await factories.TournamentOrganizationFactory.create(
			{ ownerId: ADMIN_ID, name: ORGANIZATION_NAME },
			{ members: [{ userId: orgAdmin.id, role: "ADMIN" }] },
		);

		const newTournament = new CalendarNewEventPage(page);

		await impersonate(page, orgAdmin.id);
		await newTournament.gotoNewTournament();

		await expect(
			newTournament.locators.noTournamentPermissionsAlert,
		).toBeVisible();
		await expect(newTournament.locators.newTournamentHeading).not.toBeVisible();

		await impersonate(page, ADMIN_ID);
		const organization = new OrganizationPage(page);
		await organization.goto(org.slug);
		await organization.establish();

		await impersonate(page, orgAdmin.id);
		await newTournament.gotoNewTournament();

		await expect(
			newTournament.locators.noTournamentPermissionsAlert,
		).not.toBeVisible();
		await expect(newTournament.locators.newTournamentHeading).toBeVisible();
	});
});
