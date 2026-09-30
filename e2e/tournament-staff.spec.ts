import { addHours, subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

const ROSTER_SIZE = 4;

test.describe("Tournament staff", () => {
	test("gives and takes away staff role", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		await impersonate(page, ADMIN_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		const staff = await admin.openStaff();

		// the tournament author is always shown as an organizer (info only)
		await expect(staff.locators.authorRow).toBeVisible();

		await staff.addStaffer("N-ZAP");

		await expect(staff.staffRow("N-ZAP")).toBeVisible();

		await staff.removeStaffer();

		await isNotVisible(staff.staffRow("N-ZAP"));
	});

	test("gives organizer role which allows another user to TO", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);

		// no access yet, so redirected to info
		await page.waitForURL("**/info");

		await impersonate(page, ADMIN_ID);
		await admin.goto(tournament.id);
		const staff = await admin.openStaff();
		await staff.addStaffer("N-ZAP", "ORGANIZER");

		await impersonate(page, NZAP_TEST_ID);
		await admin.goto(tournament.id);

		// an organizer gets admin page access
		await expect(admin.adminTab("Teams")).toBeVisible();
		// but an organizer has no perms to manage staff
		await isNotVisible(admin.adminTab("Staff"));
	});

	test("gives staff role which allows another user to see limited info", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 30))],
		});
		const players = await factories.UserFactory.createMany(ROSTER_SIZE * 2);
		for (const roster of [
			players.slice(0, ROSTER_SIZE),
			players.slice(ROSTER_SIZE),
		]) {
			await factories.TournamentTeamFactory.create(
				{
					tournamentId: tournament.id,
					memberUserIds: roster.map((user) => user.id),
				},
				{ isCheckedIn: true },
			);
		}
		const matches = await factories.TournamentFactory.startBracket(
			tournament.id,
		);
		const matchId = matches[0].id;

		await impersonate(page, NZAP_TEST_ID);

		const match = new TournamentMatchPage(page);
		await match.goto({ tournamentId: tournament.id, matchId });

		await isNotVisible(match.locators.roomPass);

		await impersonate(page, ADMIN_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		const staff = await admin.openStaff();
		await staff.addStaffer("N-ZAP", "STREAMER");

		await expect(staff.staffRow("N-ZAP")).toContainText("streamer");

		await impersonate(page, NZAP_TEST_ID);
		await match.goto({ tournamentId: tournament.id, matchId });

		await expect(match.locators.roomPass).toBeVisible();
	});
});
