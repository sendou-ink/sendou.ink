import type { Page } from "@playwright/test";
import { VODS_PAGE } from "~/utils/urls";
import { navigate, selectWeapon } from "../../helpers/playwright";

/** `/vods` */
export class VodsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			noVodsText: this.page.getByText(/No videos found matching this filter/),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: VODS_PAGE });
	}

	/** The point of view user of a listing, doubling as a link to their profile. */
	povLink(userName: string) {
		return this.page.getByRole("link", { name: userName });
	}

	async filterByWeapon(weaponName: string) {
		await selectWeapon({ page: this.page, name: weaponName });
	}
}
