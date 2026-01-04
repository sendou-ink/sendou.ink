import { expect, seed, test } from "~/utils/playwright";

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
});
