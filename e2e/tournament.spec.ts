import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { StageId } from "~/modules/in-game-lists/types";
import {
	tournamentBracketsPage,
	tournamentPage,
	tournamentRegisterPage,
	tournamentTeamsPage,
} from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
	test,
} from "./helpers/playwright";

test.describe("Tournament", () => {
	test("registers for tournament", async ({ page }) => {
		await seed(page, "REG_OPEN");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(1),
		});

		await page.getByTestId("register-cta").click();

		await page.getByLabel("Pick-up name").fill("Chimera");
		await page.getByTestId("save-team-button").click();

		await submit(page, "add-player-button");
		await expect(page.getByTestId("member-num-2")).toBeVisible();
		await submit(page, "add-player-button");
		await expect(page.getByTestId("member-num-3")).toBeVisible();
		await submit(page, "add-player-button");
		await expect(page.getByTestId("member-num-4")).toBeVisible();

		let stage = 5;
		for (const mode of rankedModesShort) {
			for (let i = 0; i < 2; i++) {
				while (BANNED_MAPS[mode].includes(stage as StageId)) {
					stage++;
				}

				await page.getByTestId(`map-pool-${mode}-${stage}`).click();
				stage++;
			}
		}
		await submit(page, "save-map-list-button");

		await expect(page.getByTestId("checkmark-icon-num-3")).toBeVisible();
	});

	test("checks in and appears on the bracket", async ({ page }) => {
		await seed(page, "REG_OPEN");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId: 3 }),
		});

		await isNotVisible(page.getByText("Chimera"));

		await navigate({
			page,
			url: tournamentRegisterPage(3),
		});
		await submit(page, "check-in-button");

		await page.getByTestId("brackets-tab").click();
		await expect(page.getByTestId("brackets-viewer")).toBeVisible();
		await page.getByText("Chimera").nth(0).waitFor();
	});

	test("adjusts seeds", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: `${tournamentPage(1)}/admin/seeds`,
		});

		await page.getByTestId("seed-team-1-handle").hover();
		await page.mouse.down();
		// i think the drag & drop library might actually be a bit buggy
		// so we have to do it in steps like this to allow for testing
		await page.mouse.move(0, 500, { steps: 10 });
		await page.mouse.up();

		await submit(page);

		await navigate({
			page,
			url: tournamentTeamsPage(1),
		});
		await expect(page.getByTestId("team-name").first()).not.toHaveText(
			"Chimera",
		);
	});
});
