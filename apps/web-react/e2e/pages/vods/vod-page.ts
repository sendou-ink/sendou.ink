import type { Page } from "@playwright/test";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { vodVideoPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { NewVodPage } from "./new-vod-page";

/** `/vods/:id` */
export class VodPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			publishedAt: this.page.locator("time"),
			copyTimestampsButton: this.page.getByTestId("copy-timestamps-button"),
			timestamps: this.page.getByRole("dialog").getByRole("textbox"),
			editButton: this.page.getByTestId("edit-vod-button"),
		};
	}

	async goto(vodId: number) {
		await navigate({ page: this.page, url: vodVideoPage(vodId) });
	}

	/** A cast shows the same weapon many times, so its images are numbered. */
	weaponImage(weaponSplId: MainWeaponId, nth?: number) {
		return this.page.getByTestId(
			nth === undefined
				? `weapon-img-${weaponSplId}`
				: `weapon-img-${weaponSplId}-${nth}`,
		);
	}

	async openCopyTimestamps() {
		await this.locators.copyTimestampsButton.click();
	}

	async openEdit() {
		await this.locators.editButton.click();
		return new NewVodPage(this.page);
	}
}
