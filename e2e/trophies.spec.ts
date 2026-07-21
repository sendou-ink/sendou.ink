import { NZAP_TEST_ID } from "~/db/seed/constants";
import trophies from "~/db/seed/trophies.json" with { type: "json" };
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import { decompressFromBase64 } from "~/utils/compression";
import { NEW_TROPHY_PAGE, TROPHIES_PAGE, userPage } from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
	test,
} from "./helpers/playwright";

const VALID_TROPHY_MODEL =
	decompressFromBase64(trophies["Chris P. Bacon"]) ?? "";

test.describe("Trophies", () => {
	test("shows trophy wins via user page trophy display", async ({ page }) => {
		await seed(page);
		await navigate({
			page,
			url: userPage({ discordId: ADMIN_DISCORD_ID, customUrl: "sendou" }),
		});

		await expect(page.getByTestId("trophy-display")).toBeVisible();
		await page
			.getByTestId("trophy-display")
			.getByRole("button", { name: "Wellstring Wednesday" })
			.click();

		await expect(page.getByText("View trophy page")).toBeVisible();
		await expect(
			page.getByRole("dialog").locator("a[href^='/to/']").first(),
		).toBeVisible();
	});

	test("browses trophy details from the trophies list", async ({ page }) => {
		await seed(page);
		await navigate({ page, url: TROPHIES_PAGE });

		const trophyLinks = page.locator("a[href^='/trophies/']");
		expect(await trophyLinks.count()).toBeGreaterThan(1);

		await page.getByRole("textbox").fill("Chris P");
		await expect(trophyLinks).toHaveCount(1);

		await trophyLinks.first().click();
		await expect(page).toHaveURL(/\/trophies\/\d+/);
		await expect(page.getByText("Owners")).toBeVisible();
		await expect(
			page.locator("main").locator("a[href^='/u/']").first(),
		).toBeVisible();
	});

	test("submits a new trophy after agreeing to terms", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: NEW_TROPHY_PAGE });

		const nameInput = page.getByLabel("Name").first();

		await isNotVisible(nameInput);
		await page.getByRole("button", { name: "I have read and agree" }).click();

		await nameInput.fill("E2E Test Trophy");

		await page.getByRole("button", { name: /organization/i }).click();
		await page.getByTestId("organization-search-input").fill("sendou");
		await page.getByTestId("organization-search-item").first().click();

		await page.getByLabel("3D model state").fill(VALID_TROPHY_MODEL);

		await submit(page);

		await page.getByRole("tab", { name: "Pending" }).click();
		await expect(page.getByText("E2E Test Trophy")).toBeVisible();
	});

	test("reviews pending trophies", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: NEW_TROPHY_PAGE });

		await page.getByRole("tab", { name: "Pending" }).click();

		await page
			.getByText("Pending Chris P. Bacon 3")
			.locator("../../..")
			.getByRole("button", { name: "Approve" })
			.click();
		await expect(
			page
				.getByText("Pending Chris P. Bacon 3")
				.locator("../../..")
				.getByText("1/2 approvals"),
		).toBeVisible();

		const declinedName = "Pending Wellstring Wednesday 1";
		await page
			.getByText(declinedName)
			.locator("../../..")
			.getByRole("button", { name: "Decline" })
			.click();
		await page
			.getByRole("dialog")
			.locator("textarea")
			.fill("Does not meet the requirements");
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Decline" })
			.click();

		await isNotVisible(page.getByText(declinedName));

		await page.getByRole("tab", { name: "Reviewed" }).click();
		await expect(page.getByText(declinedName)).toBeVisible();
		await expect(page.getByText("Declined by Sendou")).toBeVisible();
	});
});
