import { expect, test } from "@playwright/test";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectWeapon,
} from "~/utils/playwright";
import { ANALYZER_URL } from "~/utils/urls";

test.describe("Build Analyzer", () => {
	test("analyzes a build and links to new build page with same abilities", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: ANALYZER_URL });

		const newBuildPrompt = page.getByTestId("new-build-prompt");

		await isNotVisible(newBuildPrompt);

		await selectWeapon({ page, name: "Splattershot" });

		await page.getByTestId("movement-category").click();

		const swimSpeedBase = page.getByTestId("swim-speed-base");
		const swimSpeedSplattershot = (await swimSpeedBase.textContent())!;

		await selectWeapon({ page, name: "Luna Blaster" });

		// Luna Blaster is a light weapon so it should have lower base swim speed than Splattershot
		await expect(swimSpeedBase).not.toHaveText(swimSpeedSplattershot);

		// shows comparison value when you have relevant abilities selected
		const swimSpeedBuildValueTitle = page.getByTestId("swim-speed-build-title");
		await isNotVisible(swimSpeedBuildValueTitle);
		await page.getByTestId("SSU-ability-button").click();
		await swimSpeedBuildValueTitle.isVisible();

		// on new build page with preselected values
		await newBuildPrompt.click();
		await expect(page.getByTestId("HEAD-combobox-input")).toBeVisible();
		await expect(page.getByTestId("weapon-combobox-input")).toHaveValue(
			"Luna Blaster",
		);
		await page.getByTestId("SSU-ability").isVisible();
	});

	test("compares builds", async ({ page }) => {
		await navigate({ page, url: ANALYZER_URL });

		await page.getByTestId("build2-tab").click();

		const swimSpeedAbilityButtonLocator =
			page.getByTestId("SSU-ability-button");
		const swimSpeedAbilityLocator = page.locator(
			"[data-testid='ability-selector'] [data-testid='SSU-ability']",
		);

		await swimSpeedAbilityButtonLocator.click();
		await expect(swimSpeedAbilityLocator).toBeVisible();

		// can't add abilities to build 2 if build 1 is empty
		// -> they automatically go to build 1
		await page.getByTestId("build2-tab").click();
		await isNotVisible(swimSpeedAbilityLocator);

		await swimSpeedAbilityButtonLocator.click();
		await expect(swimSpeedAbilityLocator).toBeVisible();
		await swimSpeedAbilityButtonLocator.click();

		await page.getByTestId("ap-tab").click();
		await expect(page.getByTestId("ap-compare-1").first()).toContainText(
			"10AP",
		);
		await expect(page.getByTestId("ap-compare-2").first()).toContainText(
			"13AP",
		);

		await page.getByTestId("swim-speed").getByText("BUILD 2").isVisible();
	});
});
