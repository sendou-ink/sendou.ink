import { expect, test } from "@playwright/test";
import { navigate, selectWeapon } from "~/utils/playwright";
import { OBJECT_DAMAGE_CALCULATOR_URL } from "~/utils/urls";

test.describe("Object Damage Calculator", () => {
	test.beforeEach(async ({ page }) => {
		await navigate({ page, url: OBJECT_DAMAGE_CALCULATOR_URL });
	});

	const cellId = (id: string, damageReceiver = "Chariot") =>
		`${id}-${damageReceiver}`;

	test("operates damage type select, max damage > min damage", async ({
		page,
	}) => {
		const hp = page.getByTestId(cellId("hp"));
		const dmg = page.getByTestId(cellId("dmg"));
		const htd = page.getByTestId(cellId("htd"));

		const hpBefore = (await hp.textContent())!;
		const dmgBefore = (await dmg.textContent())!;
		const htdBefore = (await htd.textContent())!;

		// test hits to destroy calculation
		expect(Number(htdBefore)).toBe(
			Math.ceil(Number(hpBefore) / Number(dmgBefore)),
		);

		await page.locator("text=Damage type").selectOption("NORMAL_MIN");

		// select did what we expect it to do
		await expect(hp).toHaveText(hpBefore);
		await expect(dmg).not.toHaveText(dmgBefore);
		await expect(htd).not.toHaveText(htdBefore);
	});

	test("changes weapon and saves it to url", async ({ page }) => {
		const dmg = page.getByTestId(cellId("dmg"));
		const dmgBefore = (await dmg.textContent())!;

		await selectWeapon({ page, name: "Luna Blaster" });

		await expect(dmg).not.toHaveText(dmgBefore);
		await page.reload();
		await expect(dmg).not.toHaveText(dmgBefore);
	});

	test("multiplier switch increases damage", async ({ page }) => {
		await selectWeapon({ page, name: "Tri-Stringer" });

		const dmg = page.getByTestId(cellId("dmg"));
		const dmgBefore = (await dmg.textContent())!;
		await page.getByTestId("multi-switch").click();

		// Multiplier is on by default
		await expect(dmg).not.toHaveText(dmgBefore);
	});

	test("object hp increases when ability points added", async ({ page }) => {
		const crabTankHp = page.getByTestId(cellId("hp"));
		const crabTankHpBefore = (await crabTankHp.textContent())!;

		const splashWallHp = page.getByTestId(cellId("hp", "Wsb_Shield"));
		const splashWallHpBefore = (await splashWallHp.textContent())!;

		await page.locator("text=Amount of").selectOption("10");

		// Crab Tank doesn't gain HP from ability points
		await expect(crabTankHp).toHaveText(crabTankHpBefore);
		// ... but Splash Wall does
		await expect(splashWallHp).not.toHaveText(splashWallHpBefore);
	});
});
