import { NZAP_TEST_ID } from "~/db/seed/constants";
import { LFG_PAGE } from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "./helpers/playwright";

const REPORTER_ID = 30;

test.describe("User report", () => {
	test("reports a user from the card and shows it on the admin page", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, REPORTER_ID);
		await navigate({ page, url: LFG_PAGE });

		await page.getByRole("button", { name: "N-ZAP" }).first().click();
		await page.getByTestId("report-user-button").click();

		const description = "Called my team mean names in the match chat";
		await page.getByLabel("Category").selectOption("HARASSMENT");
		await page.getByLabel("Description").fill(description);
		await submit(page);

		await expect(page.getByText("Report sent to the staff")).toBeAttached();

		await impersonate(page);
		await navigate({ page, url: `/u/${NZAP_TEST_ID}/admin` });

		const reportsList = page.getByTestId("user-reports-list");
		// 15 seeded reports + the one just made
		await expect(page.getByText("16 total")).toBeVisible();
		await expect(reportsList.locator("details")).toHaveCount(16);

		await expect(page.getByText(description)).not.toBeVisible();
		await reportsList.locator("summary").first().click();
		await expect(page.getByText(description)).toBeVisible();
	});
});
