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

const nzapStaffRow = (page: Page) => page.getByTestId("staff-row-N-ZAP");

// The "For this event" staff section is read-only by default and reveals the
// form only after clicking "Edit", collapsing back once the save succeeds.
async function editStaff(page: Page) {
	await page.getByTestId("edit-staff-button").click();
}

// The staff form collapses back to the read-only view after saving, so we only
// wait for the POST and let web-first assertions wait for the revalidated DOM
// rather than for a distinct revalidation request.
async function saveStaff(page: Page) {
	const postPromise = page.waitForResponse(
		(res) => res.request().method() === "POST",
	);
	await page.getByTestId("submit-button").click();
	await postPromise;
}

async function addStaffer(page: Page, role?: string) {
	await editStaff(page);
	// The empty staff array already renders one placeholder row to fill in, so we
	// select into it directly rather than adding another row.
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

		await expect(nzapStaffRow(page)).toBeVisible();

		await editStaff(page);
		await page.getByRole("button", { name: "Remove item" }).click();
		await saveStaff(page);

		await isNotVisible(nzapStaffRow(page));
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

		await expect(nzapStaffRow(page)).toContainText("streamer");

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId: TOURNAMENT_ID, matchId: 2 }),
		});

		await goToTab(page, "join");

		await expect(roomPassSelector).toBeVisible();
	});
});
