import { NZAP_TEST_ID } from "~/db/seed/constants";
import { FRIENDS_PAGE } from "~/utils/urls";
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

test.describe("Friends", () => {
	test("send friend request, accept it, then delete friend", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: FRIENDS_PAGE });

		await selectUser({ page, userName: "N-ZAP", labelName: "User" });
		await submit(page);

		await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: FRIENDS_PAGE });

		await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
		await waitForPOSTResponse(page, () =>
			page.getByRole("button", { name: "Accept" }).click(),
		);

		await page.getByRole("button", { name: "Sendou" }).click();
		await page.getByText("Delete friend").click();
		await waitForPOSTResponse(page, () =>
			page.getByRole("button", { name: "Delete" }).click(),
		);

		await expect(page.getByText("No friends yet")).toBeVisible();
	});
});
