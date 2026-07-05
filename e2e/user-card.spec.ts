import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "./helpers/playwright";

test.describe("User card", () => {
	test("edits banner and bio from the looking page", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: SENDOUQ_LOOKING_PAGE });

		const ownGroup = page.getByTestId("sendouq-group-card").first();
		await ownGroup.getByRole("button", { name: "Sendou" }).click();

		await page.getByRole("link", { name: "Edit" }).click();
		await expect(page).toHaveURL(/\/user-card\/edit/);

		const newBio = "New bio from e2e test";
		await page.getByLabel("Short bio").fill(newBio);
		await page.getByLabel("Banner", { exact: true }).selectOption("COLOR");
		await page.getByRole("button", { name: "#4169e1" }).click();

		await submit(page);
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		await ownGroup.getByRole("button", { name: "Sendou" }).click();
		await expect(page.getByText(newBio)).toBeVisible();
		await expect(page.getByTestId("user-card-banner")).toHaveCSS(
			"background-color",
			"rgb(65, 105, 225)",
		);
	});
});
