import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "~/utils/playwright";
import { tournamentBracketsPage } from "~/utils/urls";

const AB_RR_TOURNAMENT_ID = 8;
const TEAMS_PER_DIVISION = 6;

test.describe("Tournament A/B divisions", () => {
	test("assigns 6A/6B, starts bracket, renders 36 matches across 6 rounds and two standings tables", async ({
		page,
	}) => {
		test.slow();

		await seed(page, "AB_RR");
		await impersonate(page);

		await navigate({
			page,
			url: `/to/${AB_RR_TOURNAMENT_ID}/seeds`,
		});

		await page.getByTestId("set-ab-divisions").click();

		const divisionRadioGroups = page.getByTestId("ab-division-radio-group");
		await expect(divisionRadioGroups).toHaveCount(TEAMS_PER_DIVISION * 2);

		for (let i = 0; i < TEAMS_PER_DIVISION; i++) {
			await divisionRadioGroups.nth(i).getByText("A", { exact: true }).click();
		}
		for (let i = TEAMS_PER_DIVISION; i < TEAMS_PER_DIVISION * 2; i++) {
			await divisionRadioGroups.nth(i).getByText("B", { exact: true }).click();
		}

		await submit(page, "set-ab-divisions-submit-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId: AB_RR_TOURNAMENT_ID }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await expect(page.getByTestId("brackets-viewer")).toBeVisible();

		await expect(page.locator("[data-match-id]")).toHaveCount(
			TEAMS_PER_DIVISION * TEAMS_PER_DIVISION,
		);

		for (
			let roundNumber = 1;
			roundNumber <= TEAMS_PER_DIVISION;
			roundNumber++
		) {
			await expect(
				page.getByText(`Round ${roundNumber}`, { exact: true }).first(),
			).toBeVisible();
		}

		await expect(page.getByTestId("rr-standings-table")).toHaveCount(2);
	});
});
