import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "~/utils/playwright";
import { calendarPage, tournamentBracketsPage } from "~/utils/urls";

test.describe("Tournament tiers", () => {
	test("shows tentative tier before bracket starts and confirmed tier after", async ({
		page,
	}) => {
		await seed(page);

		await navigate({ page, url: calendarPage() });

		const picnicCard = page
			.getByTestId("tournament-card")
			.filter({ hasText: "PICNIC" });
		await expect(picnicCard.getByTestId("tentative-tier")).toBeVisible();

		await impersonate(page);
		await navigate({ page, url: tournamentBracketsPage({ tournamentId: 1 }) });

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigate({ page, url: calendarPage() });

		const picnicCardAfter = page
			.getByTestId("tournament-card")
			.filter({ hasText: "PICNIC" });
		await expect(picnicCardAfter.getByTestId("confirmed-tier")).toBeVisible();
	});
});
