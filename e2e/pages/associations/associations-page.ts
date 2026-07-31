import type { Page } from "@playwright/test";
import invariant from "~/utils/invariant";
import { associationsPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";

export class AssociationsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			deleteButtons: page.getByTestId("delete-association"),
			leaveButton: page.getByTestId("leave-team-button"),
			inviteLinkInputs: page.getByLabel("Share link to add members"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: associationsPage() });
	}

	async gotoInvite(inviteCode: string) {
		await navigate({ page: this.page, url: associationsPage(inviteCode) });
	}

	heading(name: string) {
		return this.page.getByRole("heading").filter({ hasText: name });
	}

	/** The share link is shown as the whole production url, only its code is of use here. */
	async inviteCode() {
		const inviteLink = await this.locators.inviteLinkInputs
			.first()
			.inputValue();
		const inviteCode = new URL(inviteLink).searchParams.get("inviteCode");
		invariant(inviteCode, `No invite code in the share link: ${inviteLink}`);

		return inviteCode;
	}

	async join() {
		await submit(this.page);
	}

	async deleteFirst() {
		await this.locators.deleteButtons.first().click();
		await modalClickConfirmButton(this.page);
	}

	async leave() {
		await this.locators.leaveButton.click();
		await modalClickConfirmButton(this.page);
	}
}
