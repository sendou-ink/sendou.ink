import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "~/utils/playwright";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	sendouQInviteLink,
	sendouQMatchPage,
	userSeasonsPage,
} from "~/utils/urls";

test.describe("SendouQ", () => {
	test("Group preparation flow - add trusted users and users via invite link", async ({
		page,
	}) => {
		await seed(page, "NO_SQ_GROUPS");
		await impersonate(page, ADMIN_ID);

		// Create preparing group
		await navigate({ page, url: SENDOUQ_PAGE });
		await page.getByRole("button", { name: "Join with mates" }).click();

		// Verify group card visible with 1 member
		const groupCard = page.getByTestId("sendouq-group-card").first();
		await expect(
			groupCard.getByTestId("sendouq-group-card-member"),
		).toHaveCount(1);

		// -----------------

		// Verify prepared groups not visible on looking page
		// Impersonate a different user
		await impersonate(page, 3);
		await navigate({ page, url: SENDOUQ_PAGE });
		await submit(page, "join-solo-button");

		await expect(page.getByTestId("sendouq-group-card")).toBeVisible();
		// Verify ADMIN's preparing group is NOT visible
		// Only ACTIVE groups should be shown
		const sendouGroupCard = page
			.getByTestId("sendouq-group-card")
			.filter({ hasText: "Sendou" });
		await expect(sendouGroupCard).not.toBeVisible();

		// -----------------

		// Add trusted user
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: SENDOUQ_PREPARING_PAGE });
		const trustedUserSelect = page.locator('select[name="id"]');
		await trustedUserSelect.selectOption({ index: 1 }); // Select first trusted user

		// Find the add button with ADD_TRUSTED action and wait for it to be enabled
		const addMemberButton = page.locator(
			'button[type="submit"][value="ADD_TRUSTED"]',
		);
		await expect(addMemberButton).toBeEnabled();
		await addMemberButton.click();

		// Wait for 2 members to appear
		await expect(
			groupCard.getByTestId("sendouq-group-card-member"),
		).toHaveCount(2);

		// Extract invite code
		const inviteCodeInput = page.locator('input[id="invite"]');
		const inviteLink = await inviteCodeInput.inputValue();
		const inviteCode = inviteLink.split("?join=")[1];
		expect(inviteCode).toBeTruthy();

		// Join as NZAP user via invite link
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: sendouQInviteLink(inviteCode) });

		// Verify join form appears and submit
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByRole("button", { name: "Join", exact: true }).click();

		// Verify redirected to preparing page and NZAP added to group (3 members total)
		await expect(page).toHaveURL(SENDOUQ_PREPARING_PAGE);
		const prepGroupCard = page.getByTestId("sendouq-group-card").first();
		await expect(
			prepGroupCard.getByTestId("sendouq-group-card-member"),
		).toHaveCount(3);

		await page.getByRole("button", { name: "Join the queue" }).click();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
	});

	test("Challenge flow - send challenge, report match, seasons page, quick rejoin with replay", async ({
		page,
	}) => {
		await seed(page); // DEFAULT seed includes full groups for ADMIN and NZAP
		await impersonate(page, ADMIN_ID);

		// Send challenge
		await navigate({ page, url: SENDOUQ_LOOKING_PAGE });

		// Challenge all available groups (we don't know which is NZAP since full groups are censored)
		const groupCards = page.getByTestId("sendouq-group-card");
		const count = await groupCards.count();
		// starting idx 1 to skip own group
		for (let i = 1; i < count; i++) {
			const groupCard = groupCards.nth(i);
			const challengeButton = groupCard
				.locator('button[type="submit"]')
				.first();
			await challengeButton.click();
		}

		// Accept challenge as NZAP
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: SENDOUQ_LOOKING_PAGE });

		const acceptButton = page
			.getByRole("button", { name: "Start match" })
			.first();
		await expect(acceptButton).toBeVisible();
		await acceptButton.click();

		await expect(page).toHaveURL(/\/q\/match\/\d+/);
		const matchId = page.url().split("/match/")[1];

		// Verify both groups visible
		await expect(page.getByText("Alpha", { exact: true })).toBeVisible();
		await expect(page.getByText("Bravo", { exact: true })).toBeVisible();

		// Report match score (first team - ADMIN)
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: sendouQMatchPage(Number(matchId)) });

		// Report a 4-1 score (ADMIN wins)
		const winners = ["BRAVO", "ALPHA", "ALPHA", "ALPHA", "ALPHA"];
		for (let i = 0; i < winners.length; i++) {
			const side = winners[i].toLowerCase();
			await page.locator(`#${side}-${i}`).check();
		}

		// Submit score
		await submit(page, "submit-score-button");

		// Report same score as NZAP
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: sendouQMatchPage(Number(matchId)) });

		// Report same 4-1 score
		for (let i = 0; i < winners.length; i++) {
			const side = winners[i].toLowerCase();
			await page.locator(`#${side}-${i}`).check();
		}

		// Submit score and verify match is now locked
		await submit(page, "submit-score-button");
		await expect(page.getByText("4 - 1")).toBeVisible();

		// Verify match on seasons page
		await navigate({
			page,
			url: userSeasonsPage({
				user: { discordId: "123", customUrl: "sendou" },
			}),
		});
		const matchLink = page.locator(`a[href="/q/match/${matchId}"]`);
		await expect(matchLink).toBeVisible();

		// Quick rejoin and replay indicator
		// As ADMIN, click "Look again with same group"
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: sendouQMatchPage(Number(matchId)) });

		const lookAgainButton = page.getByRole("button", {
			name: "Look again with same group",
		});

		await lookAgainButton.click();
		await page.getByRole("button", { name: "Join the queue" }).click();

		// Verify redirect to looking page
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		// As NZAP, do the same
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: sendouQMatchPage(Number(matchId)) });

		const lookAgainButtonNzap = page.getByRole("button", {
			name: "Look again with same group",
		});

		await lookAgainButtonNzap.click();
		await page.getByRole("button", { name: "Join the queue" }).click();

		await expect(page.getByText("Replay")).toBeVisible();
	});

	test("Request flow - partial groups morph together", async ({ page }) => {
		await seed(page, "NO_SQ_GROUPS");

		// ADMIN creates a solo group
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: SENDOUQ_PAGE });
		await submit(page, "join-solo-button");

		// User 3 creates a solo group
		await impersonate(page, 3);
		await navigate({ page, url: SENDOUQ_PAGE });
		await submit(page, "join-solo-button");

		// Send request as ADMIN
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: SENDOUQ_LOOKING_PAGE });

		// Find user 3's group
		const groupCards = page.getByTestId("sendouq-group-card");
		const user3GroupCard = groupCards.nth(1); // Skip own group (index 0)
		await expect(user3GroupCard).toBeVisible();

		// Send request
		await submit(page, "group-card-action-button");

		// Accept request as user 3
		await impersonate(page, 3);
		await navigate({ page, url: SENDOUQ_LOOKING_PAGE });

		// Find ADMIN's group in the invitations
		const adminInviteCard = page
			.getByTestId("sendouq-group-card")
			.filter({ hasText: "Sendou" });
		await expect(adminInviteCard).toBeVisible();

		// Accept and merge
		await submit(page, "group-card-action-button");

		// Verify still on looking page (not redirected to match)
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		// Verify combined group has 2 members
		const combinedGroup = page.getByTestId("sendouq-group-card").first();
		await expect(
			combinedGroup.getByTestId("sendouq-group-card-member"),
		).toHaveCount(2);
	});
});
