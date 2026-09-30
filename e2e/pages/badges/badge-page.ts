import type { Page } from "@playwright/test";
import { badgePage } from "~/utils/urls";
import {
	navigate,
	selectUser,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/badges/:id` */
export class BadgePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			editLink: this.page.getByRole("link", { name: "Edit", exact: true }),
			owners: this.page.getByTestId("badge-owners"),
		};
	}

	async goto(badgeId: number) {
		await navigate({ page: this.page, url: badgePage(badgeId) });
	}

	owner(username: string) {
		return this.locators.owners
			.getByRole("listitem")
			.filter({ hasText: username });
	}

	async openEdit() {
		await this.locators.editLink.click();
		return new BadgeEditDialog(this.page);
	}
}

class BadgeEditDialog {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			dialog: this.page.getByRole("dialog"),
			submitButton: this.page.getByRole("button", {
				name: "Submit",
				exact: true,
			}),
		};
	}

	async addOwner(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "Add new owner",
		});
	}

	async save() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.submitButton.click(),
		);
	}
}
