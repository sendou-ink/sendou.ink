import type { Page } from "@playwright/test";
import { ORG_ADMIN_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";
import { tournamentTeamPage } from "~/utils/urls";

const ITZ_TOURNAMENT_ID = 2;
const ITZ_TEAM_ID = 101;
const USER_NOT_ON_ITZ_TEAM = 100;

async function generateWriteToken(page: Page): Promise<string> {
	await navigate({ page, url: "/api" });

	// Click the second form (write token)
	await page.locator("form").nth(1).getByRole("button").click();
	await page.waitForURL("/api");

	// Reveal and get the write token
	// After generating only the write token, there's just one reveal button (for write)
	await page.getByRole("button", { name: /reveal/i }).click();
	const token = await page.locator("input[readonly]").inputValue();

	return token;
}

test.describe("Public API", () => {
	test("OPTIONS preflight request returns 204 with CORS headers", async ({
		page,
	}) => {
		await seed(page);

		const response = await page.request.fetch("/api/tournament/1", {
			method: "OPTIONS",
		});

		expect(response.status()).toBe(204);
		expect(response.headers()["access-control-allow-origin"]).toBe("*");
		expect(response.headers()["access-control-allow-methods"]).toContain("GET");
		expect(response.headers()["access-control-allow-headers"]).toContain(
			"Authorization",
		);
	});

	test("GET request includes CORS headers in response", async ({ page }) => {
		await seed(page);

		const response = await page.request.fetch("/api/tournament/1");

		expect(response.headers()["access-control-allow-origin"]).toBe("*");
	});

	test("GET user IDs endpoint works without authentication", async ({
		page,
	}) => {
		await seed(page);

		const response = await page.request.fetch(`/api/user/${ADMIN_ID}/ids`);

		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.id).toBe(ADMIN_ID);
		expect(data.discordId).toBeTruthy();
	});

	test("creates read API token and calls public endpoint", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({ page, url: "/api" });

		await page.locator("form").first().getByRole("button").click();
		await page.waitForURL("/api");

		await page
			.getByRole("button", { name: /reveal/i })
			.first()
			.click();

		const token = await page.locator("input[readonly]").inputValue();
		expect(token).toBeTruthy();
		expect(token.length).toBe(20);

		const response = await page.request.fetch(`/api/user/${ADMIN_ID}`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.id).toBe(ADMIN_ID);
		expect(data.name).toBe("Sendou");
	});
});

test.describe("Public API - Write endpoints", () => {
	test("adds member to tournament team via API", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);

		const token = await generateWriteToken(page);

		const response = await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/add-member`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		expect(response.status()).toBe(200);

		// Verify in UI that member was added
		await navigate({
			page,
			url: tournamentTeamPage({
				tournamentId: ITZ_TOURNAMENT_ID,
				tournamentTeamId: ITZ_TEAM_ID,
			}),
		});

		// User 100 should be visible on the team page
		await expect(page.getByTestId("team-member-name")).toHaveCount(5);
	});

	test("removes member from tournament team via API", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);

		const token = await generateWriteToken(page);

		// First add the member
		await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/add-member`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		// Verify member was added
		await navigate({
			page,
			url: tournamentTeamPage({
				tournamentId: ITZ_TOURNAMENT_ID,
				tournamentTeamId: ITZ_TEAM_ID,
			}),
		});
		await expect(page.getByTestId("team-member-name")).toHaveCount(5);

		// Remove the member via API
		const response = await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/remove-member`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		expect(response.status()).toBe(200);

		// Verify in UI that member was removed
		await page.reload();
		await expect(page.getByTestId("team-member-name")).toHaveCount(4);
	});

	test("returns 401 for invalid token", async ({ page }) => {
		await seed(page);

		const response = await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/add-member`,
			{
				method: "POST",
				headers: {
					Authorization: "Bearer invalid-token-12345",
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		expect(response.status()).toBe(401);
		const data = await response.json();
		expect(data.error).toBe("Invalid token");
	});

	test("returns 403 when using read token for write endpoint", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);

		await navigate({ page, url: "/api" });

		// Click the first form (read token)
		await page.locator("form").first().getByRole("button").click();
		await page.waitForURL("/api");

		// Reveal and get the read token
		await page
			.getByRole("button", { name: /reveal/i })
			.first()
			.click();
		const readToken = await page
			.locator("input[readonly]")
			.first()
			.inputValue();

		const response = await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/add-member`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${readToken}`,
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		expect(response.status()).toBe(403);
		const data = await response.json();
		expect(data.error).toBe("Write token required");
	});

	test("returns 400 when user is not the organizer of this tournament", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, ORG_ADMIN_TEST_ID);

		const token = await generateWriteToken(page);

		const response = await page.request.fetch(
			`/api/tournament/${ITZ_TOURNAMENT_ID}/teams/${ITZ_TEAM_ID}/add-member`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				data: { userId: USER_NOT_ON_ITZ_TEAM },
			},
		);

		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data.error).toBe("Unauthorized");
	});
});
