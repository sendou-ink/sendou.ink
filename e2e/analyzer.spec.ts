import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { AnalyzerPage } from "./pages/analyzer/analyzer-page";

test.describe("Build Analyzer", () => {
	test("analyzes a build and links to new build page with same abilities", async ({
		page,
	}) => {
		await impersonate(page, NZAP_TEST_ID);

		const analyzer = new AnalyzerPage(page);
		await analyzer.goto();

		await isNotVisible(analyzer.locators.newBuildPrompt);

		await analyzer.selectWeapon("Splattershot");

		await analyzer.openStatCategory("movement-category");

		const swimSpeed = analyzer.statCard("swim-speed");
		const swimSpeedSplattershot = (await swimSpeed.baseValue.textContent())!;

		await analyzer.selectWeapon("Luna Blaster");

		// Luna Blaster is a light weapon so it should have lower base swim speed than Splattershot
		await expect(swimSpeed.baseValue).not.toHaveText(swimSpeedSplattershot);

		await isNotVisible(swimSpeed.buildValueTitle);
		await analyzer.addAbility("SSU");
		await expect(swimSpeed.buildValueTitle).toBeVisible();

		const buildForm = await analyzer.openNewBuildPrompt();
		await expect(buildForm.gearSelect("HEAD")).toBeVisible();
		await expect(buildForm.weaponPoolItem("Luna Blaster")).toBeVisible();
		await expect(buildForm.ability("SSU")).toBeVisible();
	});

	test("compares builds", async ({ page }) => {
		const analyzer = new AnalyzerPage(page);
		await analyzer.goto();

		await analyzer.selectTab("build2");

		const swimSpeedAbility = analyzer.selectedAbility("SSU");

		await analyzer.addAbility("SSU");
		await expect(swimSpeedAbility).toBeVisible();

		// can't add abilities to build 2 if build 1 is empty
		// -> they automatically go to build 1
		await analyzer.selectTab("build2");
		await isNotVisible(swimSpeedAbility);

		await analyzer.addAbility("SSU");
		await expect(swimSpeedAbility).toBeVisible();
		await analyzer.addAbility("SSU");
		await expect(swimSpeedAbility).toHaveCount(2);

		await analyzer.selectTab("ap");
		await expect(analyzer.apComparison(1).first()).toContainText("10AP");
		await expect(analyzer.apComparison(2).first()).toContainText("13AP");

		await expect(analyzer.statCard("swim-speed").buildValueTitle).toContainText(
			"Build 2",
		);
	});
});
