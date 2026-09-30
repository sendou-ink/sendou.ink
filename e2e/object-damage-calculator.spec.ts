import { expect, test } from "./helpers/playwright";
import { ObjectDamageCalculatorPage } from "./pages/object-damage-calculator/object-damage-calculator-page";

test.describe("Object Damage Calculator", () => {
	test("operates damage type select, max damage > min damage", async ({
		page,
	}) => {
		const calculator = new ObjectDamageCalculatorPage(page);
		await calculator.goto();

		const hp = calculator.hitPoints();
		const dmg = calculator.damage();
		const htd = calculator.hitsToDestroy();

		const hpBefore = (await hp.textContent())!;
		const dmgBefore = (await dmg.textContent())!;
		const htdBefore = (await htd.textContent())!;

		expect(Number(htdBefore)).toBe(
			Math.ceil(Number(hpBefore) / Number(dmgBefore)),
		);

		await calculator.selectDamageType("NORMAL_MIN");

		await expect(hp).toHaveText(hpBefore);
		await expect(dmg).not.toHaveText(dmgBefore);
		await expect(htd).not.toHaveText(htdBefore);
	});

	test("changes weapon and saves it to url", async ({ page }) => {
		const calculator = new ObjectDamageCalculatorPage(page);
		await calculator.goto();

		const dmg = calculator.damage();
		const dmgBefore = (await dmg.textContent())!;

		await calculator.selectWeapon("Luna Blaster");

		await expect(dmg).not.toHaveText(dmgBefore);
		await page.reload();
		await expect(dmg).not.toHaveText(dmgBefore);
	});

	test("multiplier switch increases damage", async ({ page }) => {
		const calculator = new ObjectDamageCalculatorPage(page);
		await calculator.goto();

		await calculator.selectWeapon("Tri-Stringer");

		const dmg = calculator.damage();
		const dmgBefore = (await dmg.textContent())!;
		await calculator.toggleMultiplier();

		// Multiplier is on by default
		await expect(dmg).not.toHaveText(dmgBefore);
	});

	test("object hp increases when ability points added", async ({ page }) => {
		const calculator = new ObjectDamageCalculatorPage(page);
		await calculator.goto();

		const crabTankHp = calculator.hitPoints();
		const crabTankHpBefore = (await crabTankHp.textContent())!;

		const splashWallHp = calculator.hitPoints("Wsb_Shield");
		const splashWallHpBefore = (await splashWallHp.textContent())!;

		await calculator.selectAbilityPoints(10);

		// Crab Tank doesn't gain HP from ability points
		await expect(crabTankHp).toHaveText(crabTankHpBefore);
		// ... but Splash Wall does
		await expect(splashWallHp).not.toHaveText(splashWallHpBefore);
	});
});
