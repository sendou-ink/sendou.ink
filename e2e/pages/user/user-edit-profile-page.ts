import type { Page } from "@playwright/test";
import { userEditProfileBaseSchema } from "~/features/user-page/user-page-schemas";
import { userEditProfilePage } from "~/utils/urls";
import { expect, navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/u/:identifier/edit` */
export class UserEditProfilePage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, userEditProfileBaseSchema);
	}

	async goto(discordId: string) {
		await navigate({
			page: this.page,
			url: userEditProfilePage({ discordId }),
		});
	}

	async selectCountry(name: string) {
		await this.page.getByLabel("Country").click();
		const search = this.page.getByRole("combobox", { name: "Search" });
		await search.fill(name);

		// not a click: the popover moves as the list filters and Playwright's retry scrolls the trigger off screen, hiding it
		const optionId = await this.page
			.getByRole("option", { name })
			.getAttribute("id");
		await expect(search).toHaveAttribute(
			"aria-activedescendant",
			optionId ?? "",
		);
		await search.press("Enter");
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
