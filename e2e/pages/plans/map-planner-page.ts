import type { Page } from "@playwright/test";
import { PLANNER_URL } from "~/utils/urls";
import { expect, navigate } from "../../helpers/playwright";

export class MapPlannerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			canvas: page.locator(".tl-canvas"),
			imageShapes: page.locator(".tl-shape[data-shape-type='image']"),
			stageSelect: page.getByLabel("Select stage"),
			setBackgroundButton: page.getByRole("button", {
				name: "Set background",
			}),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: PLANNER_URL });
		await expect(this.locators.canvas).toBeVisible();
	}

	async setBackground(stageName: string) {
		await this.locators.stageSelect.selectOption({ label: stageName });
		await this.locators.setBackgroundButton.click();
	}

	async openWeaponCategory(categoryName: string) {
		await this.page.getByText(categoryName, { exact: true }).click();
	}

	/** Drags via raw mouse events because the weapon buttons are dnd-kit draggables, not native HTML drag sources. */
	async dragWeaponToCanvas(weaponName: string) {
		const weaponButton = this.page.getByRole("button", {
			name: weaponName,
			exact: true,
		});
		await weaponButton.scrollIntoViewIfNeeded();

		const sourceBox = await weaponButton.boundingBox();
		const canvasBox = await this.locators.canvas.boundingBox();
		if (!sourceBox || !canvasBox) {
			throw new Error("Missing bounding box for drag");
		}

		await this.page.mouse.move(
			sourceBox.x + sourceBox.width / 2,
			sourceBox.y + sourceBox.height / 2,
		);
		await this.page.mouse.down();
		await this.page.mouse.move(
			canvasBox.x + canvasBox.width * 0.6,
			canvasBox.y + canvasBox.height * 0.6,
			{ steps: 10 },
		);
		await this.page.mouse.up();
	}
}
