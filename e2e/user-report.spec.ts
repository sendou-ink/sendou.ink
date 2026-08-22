import { subDays } from "date-fns";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, test } from "./helpers/playwright";
import { LFGPage } from "./pages/lfg/lfg-page";
import { SendouQMatchPage } from "./pages/sendouq/sendouq-match-page";
import { UserAdminPage } from "./pages/user/user-admin-page";

test.describe("User report", () => {
	test("reports a user from the card and shows it on the admin page", async ({
		page,
		factories,
	}) => {
		const [reporter, ...earlierReporters] =
			await factories.UserFactory.createMany(3);
		for (const earlierReporter of earlierReporters) {
			await factories.UserReportFactory.create(
				{
					reporterUserId: earlierReporter.id,
					reportedUserId: NZAP_TEST_ID,
				},
				{ createdAt: subDays(new Date(), 1) },
			);
		}
		await factories.LFGPostFactory.create({ authorId: NZAP_TEST_ID });

		await impersonate(page, reporter.id);

		const lfg = new LFGPage(page);
		await lfg.goto();
		const card = await lfg.openUserCard("N-ZAP");
		const reportDialog = await card.openReportDialog();

		const description = "Called my team mean names in the match chat";
		await reportDialog.form.select("category", "HARASSMENT");
		await reportDialog.form.fill("description", description);
		await reportDialog.send();

		await expect(reportDialog.locators.sentToast).toBeAttached();

		await impersonate(page);

		const adminPage = new UserAdminPage(page);
		await adminPage.goto(NZAP_TEST_DISCORD_ID);

		await expect(adminPage.totalReportsText(3)).toBeVisible();
		await expect(adminPage.locators.reportDetails).toHaveCount(3);

		await expect(adminPage.text(description)).not.toBeVisible();
		await adminPage.openFirstReport();
		await expect(adminPage.text(description)).toBeVisible();
	});

	test("points elsewhere instead of reporting an inappropriate nickname", async ({
		page,
		factories,
	}) => {
		const reporter = await factories.UserFactory.create();
		await factories.LFGPostFactory.create({ authorId: NZAP_TEST_ID });

		await impersonate(page, reporter.id);

		const lfg = new LFGPage(page);
		await lfg.goto();
		const card = await lfg.openUserCard("N-ZAP");
		const reportDialog = await card.openReportDialog();

		await expect(reportDialog.locators.submitButton).toBeVisible();

		await reportDialog.form.select("category", "INAPPROPRIATE_NICKNAME");

		await expect(reportDialog.locators.nicknameInstructions).toBeVisible();
		await expect(reportDialog.locators.submitButton).not.toBeVisible();
	});

	test("prefills the match id when reporting from a match page", async ({
		page,
		factories,
	}) => {
		const alphaMates = await factories.UserFactory.createMany(3);
		const bravoMates = await factories.UserFactory.createMany(3);
		const match = await factories.SQMatchFactory.create({
			alphaUserIds: [ADMIN_ID, ...alphaMates.map((user) => user.id)],
			bravoUserIds: [NZAP_TEST_ID, ...bravoMates.map((user) => user.id)],
		});

		await impersonate(page);

		const matchPage = new SendouQMatchPage(page);
		await matchPage.goto(match.id, "rosters");

		const card = await matchPage.openUserCard(/N-ZAP/);
		const reportDialog = await card.openReportDialog();

		await expect(reportDialog.locators.matchIdInput).toHaveValue(
			String(match.id),
		);
	});
});
