import type { Page } from "@playwright/test";
import { NZAP_TEST_ID, STAFF_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	selectWeapon,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";

/**
 * Tests for the SendouQ match page (`/q/match/$id`).
 *
 * Relies on the `IN_SQ_MATCH` seed variant which puts Sendou (ADMIN) in the
 * matchmade group (cascade rejoin vote) and NZAP in the trusted group
 * (single-click rejoin). The staff test user (Panda, id 11329) is a
 * non-participant staff member that can force-report scores.
 *
 * Member IDs are deterministic from the seed — Sendou's group members are
 * [ADMIN_ID, 95, 96, 97] and NZAP's group members are [NZAP_TEST_ID, 98, 99, 100].
 *
 */

const ADMIN_GROUP_OTHER_MEMBER_IDS = [95, 96, 97] as const;

test.describe("SendouQ match page", () => {
	test("Score reporting: report, undo, weapon report, confirm", async ({
		page,
	}) => {
		const matchId = await seedMatchAndGetId(page);

		await reportMapWinner(page, "ALPHA");
		await reportMapWinner(page, "ALPHA");

		const undoButton = page.getByRole("button", { name: "Undo report" });
		await expect(undoButton).toBeVisible();
		await waitForPOSTResponse(page, async () => {
			await undoButton.click();
		});

		await reportMapWinner(page, "ALPHA");

		await page.getByRole("button", { name: "Report used weapons" }).click();
		await selectWeapon({ page, name: "Splattershot" });
		await waitForPOSTResponse(page, async () => {
			await page
				.getByRole("button", { name: "Submit", exact: true })
				.last()
				.click();
		});
		await expect(
			page.getByRole("button", { name: "Undo weapon" }),
		).toBeVisible();

		await reportMapWinner(page, "BRAVO");
		await reportMapWinner(page, "ALPHA");
		// Set-ending map (ALPHA's 4th win): confirmation dialog
		await selectMapWinner(page, "ALPHA");
		await page
			.getByRole("button", { name: "Submit", exact: true })
			.first()
			.click();
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Confirm", exact: true }).click();
		});

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Confirm score" }).click();
		});

		await expect(page.getByText(/4\s*-\s*1/).first()).toBeVisible();
		// Verify the reported Splattershot shows up on the result-tab timeline
		// (the compact action-tab timeline omits per-map weapons).
		await navigate({
			page,
			url: `${sendouQMatchPage(Number(matchId))}?tab=result`,
		});
		await expect(
			page.getByRole("img", { name: "Splattershot" }).first(),
		).toBeVisible();
	});

	test("Staff score report: non-participant staff force-reports and locks match", async ({
		page,
	}) => {
		const matchId = await seedMatchAndGetId(page);
		await staffSweepAlpha(page, matchId);
		await expect(page.getByText(/4\s*-\s*0/).first()).toBeVisible();
	});

	test("Cancel flow: request, refused, re-request, accepted locks match", async ({
		page,
	}) => {
		const matchId = await seedMatchAndGetId(page);

		await page.getByRole("button", { name: "Request cancel" }).click();
		await waitForPOSTResponse(page, async () => {
			await page.getByTestId("confirm-button").click();
		});
		await expect(
			page.getByText("Pending other team's confirmation"),
		).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await expect(page.getByText("Accept canceling the set?")).toBeVisible();
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Refuse" }).click();
		});

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await page.getByRole("button", { name: "Request cancel" }).click();
		await waitForPOSTResponse(page, async () => {
			await page.getByTestId("confirm-button").click();
		});

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Accept" }).click();
		});

		await expect(page.getByText("Match canceled")).toBeVisible();
	});

	test("Rejoin: NZAP trusted group one-click look again", async ({ page }) => {
		const matchId = await seedMatchAndGetId(page);
		await staffSweepAlpha(page, matchId);

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await waitForPOSTResponse(page, async () => {
			await page
				.getByRole("button", { name: "Look again with same group" })
				.click();
		});

		await navigate({ page, url: SENDOUQ_PAGE });
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
	});

	test("Rejoin vote: 'no' shows rejoin queue link", async ({ page }) => {
		const matchId = await seedMatchAndGetId(page);
		await staffSweepAlpha(page, matchId);

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await voteNo(page);

		await expect(page.getByText("You declined to continue")).toBeVisible();
		const rejoinLink = page.getByRole("link", { name: "Rejoin queue" });
		await expect(rejoinLink).toHaveAttribute("href", SENDOUQ_PAGE);
	});

	test("Rejoin vote: cascade wipes yes on no, revote completes and rejoins", async ({
		page,
	}) => {
		const matchId = await seedMatchAndGetId(page);
		await staffSweepAlpha(page, matchId);

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Yes, continue" }).click();
		});
		await expect(page.getByLabel("voted yes")).toHaveCount(1);
		await expect(page.getByLabel("pending")).toHaveCount(3);

		const [memberB, memberC, memberD] = ADMIN_GROUP_OTHER_MEMBER_IDS;

		await impersonate(page, memberB);
		await navigate({ page, url: matchActionUrl(matchId) });
		await voteNo(page);

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: matchActionUrl(matchId) });
		// Sendou's yes was wiped by member B's no → back to pending
		await expect(page.getByLabel("voted no")).toHaveCount(1);
		await expect(page.getByLabel("voted yes")).toHaveCount(0);
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("button", { name: "Yes, continue" }).click();
		});

		for (const memberId of [memberC, memberD]) {
			await impersonate(page, memberId);
			await navigate({ page, url: matchActionUrl(matchId) });
			await waitForPOSTResponse(page, async () => {
				await page.getByRole("button", { name: "Yes, continue" }).click();
			});
		}

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: SENDOUQ_PAGE });
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
		const ownGroupCard = page.getByTestId("sendouq-group-card").first();
		await expect(
			ownGroupCard.getByTestId("sendouq-group-card-member"),
		).toHaveCount(3);
	});
});

function matchActionUrl(matchId: string) {
	return `${sendouQMatchPage(Number(matchId))}?tab=action`;
}

async function seedMatchAndGetId(page: Page) {
	await seed(page, "IN_SQ_MATCH");
	await impersonate(page, ADMIN_ID);
	await navigate({ page, url: SENDOUQ_PAGE });
	await expect(page).toHaveURL(/\/q\/match\/\d+/);
	const matchId = page.url().split("/match/")[1];
	await navigate({ page, url: matchActionUrl(matchId) });
	return matchId;
}

async function reportMapWinner(page: Page, winner: "ALPHA" | "BRAVO") {
	await selectMapWinner(page, winner);
	await waitForPOSTResponse(page, async () => {
		await page
			.getByRole("button", { name: "Submit", exact: true })
			.first()
			.click();
	});
}

async function selectMapWinner(page: Page, winner: "ALPHA" | "BRAVO") {
	const teamName = winner === "ALPHA" ? "Group Alpha" : "Group Bravo";
	// react-aria's Radio renders a hidden input behind a span overlay; click the
	// wrapping label so the press handler fires and updates winnerId.
	await page.locator(`label:has(input[aria-label="${teamName}"])`).click();
}

async function voteNo(page: Page) {
	await page.getByRole("button", { name: "No, I'm done" }).click();
	await waitForPOSTResponse(page, async () => {
		await page.getByTestId("confirm-button").click();
	});
}

async function staffSweepAlpha(page: Page, matchId: string) {
	await impersonate(page, STAFF_TEST_ID);
	await navigate({ page, url: matchActionUrl(matchId) });
	for (let i = 0; i < 3; i++) {
		await reportMapWinner(page, "ALPHA");
	}
	// 4th ALPHA win triggers the set-ending confirmation dialog
	await selectMapWinner(page, "ALPHA");
	await page
		.getByRole("button", { name: "Submit", exact: true })
		.first()
		.click();
	await waitForPOSTResponse(page, async () => {
		await page.getByRole("button", { name: "Confirm", exact: true }).click();
	});
}
