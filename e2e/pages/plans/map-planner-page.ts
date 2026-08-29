import type { Page } from "@playwright/test";
import { PLANNER_PERSISTENCE_KEY } from "~/features/map-planner/plans-constants";
import { PLANNER_URL } from "~/utils/urls";
import { expect, expectIsHydrated, navigate } from "../../helpers/playwright";

const TLDRAW_DB_NAME = `TLDRAW_DOCUMENT_v2${PLANNER_PERSISTENCE_KEY}`;
const TLDRAW_RECORDS_STORE = "records";

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

	/** Reloads once the plan reached IndexedDB, tldraw throttling its writes. */
	async reloadWithPersistedPlan(expectedImageShapeCount: number) {
		await expect
			.poll(
				() =>
					this.page.evaluate(
						({ dbName, storeName }) =>
							new Promise<number>((resolve) => {
								const openRequest = indexedDB.open(dbName);
								openRequest.onerror = () => resolve(0);
								openRequest.onsuccess = () => {
									const db = openRequest.result;
									if (!db.objectStoreNames.contains(storeName)) {
										db.close();
										resolve(0);
										return;
									}

									const getAllRequest = db
										.transaction(storeName)
										.objectStore(storeName)
										.getAll();
									getAllRequest.onerror = () => {
										db.close();
										resolve(0);
									};
									getAllRequest.onsuccess = () => {
										db.close();
										resolve(
											(
												getAllRequest.result as {
													typeName?: string;
													type?: string;
												}[]
											).filter(
												(record) =>
													record.typeName === "shape" &&
													record.type === "image",
											).length,
										);
									};
								};
							}),
						{ dbName: TLDRAW_DB_NAME, storeName: TLDRAW_RECORDS_STORE },
					),
				{ timeout: 15_000 },
			)
			.toBe(expectedImageShapeCount);

		await this.page.reload();
		await expectIsHydrated(this.page);
		await expect(this.locators.canvas).toBeVisible();
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
