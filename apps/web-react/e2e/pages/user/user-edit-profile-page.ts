import type { Page } from "@playwright/test";
import { userEditProfileBaseSchema } from "~/features/user-page/user-page-schemas";
import { userEditProfilePage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/u/:identifier/edit` */
export class UserEditProfilePage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, userEditProfileBaseSchema);
		this.locators = {
			badgesSelector: page.getByTestId("badges-selector"),
			badgeDisplay: page.getByTestId("badge-display"),
		};
	}

	async goto(discordId: string) {
		await navigate({
			page: this.page,
			url: userEditProfilePage({ discordId }),
		});
	}

	async selectFavoriteBadge(badgeId: number) {
		await this.locators.badgesSelector.selectOption(String(badgeId));
	}

	async selectStickSens(value: string) {
		await this.page.getByLabel("R-stick sens").selectOption(value);
	}

	async selectMotionSens(value: string) {
		await this.page.getByLabel("Motion sens").selectOption(value);
	}

	async selectCountry(name: string) {
		await this.page.getByLabel("Country").click();
		await this.page.getByRole("searchbox", { name: "Search" }).fill(name);
		await this.page.getByRole("option", { name }).click();
	}

	async deleteWeapon(name: string | RegExp) {
		await this.page
			.getByRole("button", { name })
			.getByRole("button", { name: "Delete" })
			.click();
	}

	async save() {
		await submit(this.page);
	}
}
