import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";

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
