import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { FRIENDS_PAGE, LFG_PAGE, SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	selectUser,
	submit,
	test,
	waitForPOSTResponse,
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

test.describe("User card friend request", () => {
	test("receiver sees add friend button that accepts the incoming request", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: FRIENDS_PAGE });

		await selectUser({ page, userName: "Sendou", labelName: "User" });
		await submit(page);
		await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

		await impersonate(page);
		await navigate({ page, url: LFG_PAGE });

		await page.getByRole("button", { name: "N-ZAP" }).first().click();

		const acceptButton = page.getByLabel("Accept friend request");
		await expect(acceptButton).toBeVisible();
		await expect(page.getByLabel("Friend request pending")).not.toBeVisible();

		await waitForPOSTResponse(page, () => acceptButton.click());

		await expect(page.getByText("Friend request accepted")).toBeAttached();
		await expect(acceptButton).not.toBeVisible();
		await expect(page.getByLabel("Send friend request")).not.toBeVisible();

		await navigate({ page, url: FRIENDS_PAGE });
		await expect(page.getByRole("button", { name: "N-ZAP" })).toBeVisible();
	});

	test("sender still sees pending state on the receiver's card", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: FRIENDS_PAGE });

		await selectUser({ page, userName: "N-ZAP", labelName: "User" });
		await submit(page);
		await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

		await navigate({ page, url: LFG_PAGE });
		await page.getByRole("button", { name: "N-ZAP" }).first().click();

		await expect(page.getByLabel("Friend request pending")).toBeVisible();
		await expect(page.getByLabel("Friend request pending")).toBeDisabled();
		await expect(page.getByLabel("Accept friend request")).not.toBeVisible();
	});
});
