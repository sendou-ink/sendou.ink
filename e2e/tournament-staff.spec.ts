import type { Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { tournamentAdminPage, tournamentMatchPage } from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	startBracket,
	test,
} from "./helpers/playwright";
import { goToTab } from "./helpers/tournament-match";

const TOURNAMENT_ID = 2;

const nzapStaffRow = 'fieldset:has(button:has-text("N-ZAP"))';

// The staff form stays on the same page after saving (successToast redirects to
// the same URL), so we only wait for the POST and let web-first assertions wait
// for the revalidated DOM rather than for a distinct revalidation request.
async function saveStaff(page: Page) {
	const postPromise = page.waitForResponse(
		(res) => res.request().method() === "POST",
	);
	await page.getByTestId("submit-button").click();
	await postPromise;
}

async function addStaffer(page: Page, role?: string) {
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await selectUser({
		page,
		userName: "N-ZAP",
		labelName: "User",
	});
	if (role) {
		await page.getByLabel("Role", { exact: true }).selectOption(role);
	}
	await saveStaff(page);
}

test.describe("Tournament staff", () => {
	test("gives and takes away staff role", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);

		await navigate({
			page,
			url: tournamentAdminPage(TOURNAMENT_ID),
		});

		await page.getByRole("tab", { name: "Staff" }).click();

		// the tournament author is always shown as an organizer (info only)
		await expect(page.getByTestId("staff-author")).toBeVisible();

		await addStaffer(page);

		await expect(page.locator(nzapStaffRow)).toBeVisible();

		await page.getByRole("button", { name: "Remove item" }).click();
		await saveStaff(page);

		await isNotVisible(page.locator(nzapStaffRow));
	});

	test("gives organizer role which allows another user to TO", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);

		await navigate({
			page,
			url: tournamentAdminPage(TOURNAMENT_ID),
		});

		// check that got redirected since has no access
		await page.waitForURL("**/info");

		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: tournamentAdminPage(TOURNAMENT_ID),
		});

		await page.getByRole("tab", { name: "Staff" }).click();
		await addStaffer(page, "ORGANIZER");

		await impersonate(page, NZAP_TEST_ID);

		await navigate({
			page,
			url: tournamentAdminPage(TOURNAMENT_ID),
		});

		// being an organizer grants admin page access (no longer redirected to info)
		await expect(page.getByRole("tab", { name: "Teams" })).toBeVisible();
		// but an organizer has no perms to manage staff
		await isNotVisible(page.getByRole("tab", { name: "Staff" }));
	});

	test("gives staff role which allows another user to see limited info", async ({
		page,
	}) => {
		await startBracket(page);

		await impersonate(page, NZAP_TEST_ID);

		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId: TOURNAMENT_ID, matchId: 2 }),
		});

		const roomPassSelector = page.getByTestId("room-pass");

		await isNotVisible(roomPassSelector);

		await impersonate(page, ADMIN_ID);

		await navigate({
			page,
			url: tournamentAdminPage(TOURNAMENT_ID),
		});

		await page.getByRole("tab", { name: "Staff" }).click();
		await addStaffer(page, "STREAMER");

		await expect(
			page.locator(nzapStaffRow).getByLabel("Role", { exact: true }),
		).toHaveValue("STREAMER");

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId: TOURNAMENT_ID, matchId: 2 }),
		});

		await goToTab(page, "join");

		await expect(roomPassSelector).toBeVisible();
	});
});
