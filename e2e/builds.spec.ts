import { subDays } from "date-fns";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { expect, impersonate, test } from "./helpers/playwright";
import { BuildFormPage } from "./pages/builds/build-form-page";
import { BuildsPage } from "./pages/builds/builds-page";
import { UserBuildsPage } from "./pages/builds/user-builds-page";
import { WeaponBuildsPage } from "./pages/builds/weapon-builds-page";

const ABILITIES_WITH_ISM: BuildAbilitiesTuple = [
	["ISM", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
];

const ABILITIES_WITHOUT_ISM: BuildAbilitiesTuple = [
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
	["QR", "QR", "QR", "QR"],
];

test.describe("Builds", () => {
	test("adds a build", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const buildForm = new BuildFormPage(page);
		await buildForm.gotoNew(NZAP_TEST_DISCORD_ID);

		await buildForm.form.selectWeapons("weapons", [
			"Tenta Brella",
			"Splat Brella",
		]);

		await buildForm.selectGear("HEAD", "White Headband");
		await buildForm.selectGear("CLOTHES", "Basic Tee");
		await buildForm.selectGear("SHOES", "Blue Lo-Tops");

		await buildForm.addAbility("ISM", 12);

		await buildForm.form.fill("title", "Test Build");
		await buildForm.form.fill("description", "Test Description");
		await buildForm.form.checkItems("modes", ["TC"]);

		await buildForm.form.submit();

		const userBuilds = new UserBuildsPage(page);
		await expect(userBuilds.locators.changeSortingButton).toBeVisible();

		const firstBuildCard = userBuilds.buildCard(0);

		await expect(firstBuildCard.weaponImage("Tenta Brella")).toBeVisible();
		await expect(firstBuildCard.weaponImage("Splat Brella")).toBeVisible();

		await expect(firstBuildCard.modeImage("Tower Control")).toBeVisible();
		await expect(firstBuildCard.modeImage("Splat Zones")).not.toBeVisible();

		await expect(firstBuildCard.title).toContainText("Test Build");
	});

	test("makes build private", async ({ page, factories }) => {
		// backdating one build makes the updatedAt sort deterministic
		const [olderBuild] = await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
		});
		await factories.backdate("Build", olderBuild.id, {
			updatedAt: subDays(new Date(), 1),
		});

		await impersonate(page);

		const userBuilds = new UserBuildsPage(page);
		await userBuilds.goto(ADMIN_DISCORD_ID);

		const buildIdBefore = await userBuilds.buildId(0);

		const buildForm = await userBuilds.editBuild(0);
		await buildForm.form.check("isPrivate");
		await buildForm.form.submit();

		await expect(userBuilds.locators.buildsTab).toContainText("Builds (2)");
		await expect(userBuilds.buildCard(0).root).toContainText("Private");

		const buildIdAfter = await userBuilds.buildId(0);
		expect(buildIdAfter).toBe(buildIdBefore);

		await impersonate(page, NZAP_TEST_ID);
		await userBuilds.goto(ADMIN_DISCORD_ID);
		await expect(userBuilds.locators.buildsTab).toContainText("Builds (1)");
		await expect(userBuilds.buildCard(0).root).not.toContainText("Private");
	});

	test("filters builds", async ({ page, factories }) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["TC"],
			abilities: ABILITIES_WITH_ISM,
		});
		await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["SZ"],
			abilities: ABILITIES_WITHOUT_ISM,
		});

		const weaponBuilds = new WeaponBuildsPage(page);
		await new BuildsPage(page).openWeapon(40);

		await weaponBuilds.addFilter("ability");
		await weaponBuilds.locators.comparisonSelect.selectOption("AT_MOST");

		// are all builds with ISM are hidden?
		await expect(weaponBuilds.ability("ISM")).toHaveCount(1);

		await weaponBuilds.deleteFilter();

		await expect(weaponBuilds.ability("ISM").nth(1)).toBeVisible();

		await weaponBuilds.addFilter("mode");
		await weaponBuilds.modeFilterCheckbox("Tower Control").click();
		await expect(weaponBuilds.modeBadge("TC")).toHaveCount(3);
		await weaponBuilds.deleteFilter();
		await expect(weaponBuilds.locators.buildCards.first()).toBeVisible();

		await weaponBuilds.addFilter("date");
		await weaponBuilds.locators.dateSelect.selectOption("CUSTOM");
		await expect(weaponBuilds.locators.dateInput).toBeVisible();
		// no change in count since all builds in test data are new
		await expect(weaponBuilds.locators.buildCards).toHaveCount(5);
	});
});
